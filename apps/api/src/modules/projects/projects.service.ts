import { ProjectMemberRole } from '@prisma/client';
import type { AuthUser } from '@worknest/types';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination } from '../../utils/helpers';
import {
  canManageProject,
  logActivity,
  mapUserRef,
  progressFromItems,
  suggestProjectKey,
  uniqueProjectKey,
  userRefSelect,
} from './helpers';
import type {
  addMemberSchema,
  createProjectSchema,
  paginationSchema,
  updateProjectSchema,
} from './projects.schema';

const projectListInclude = {
  department: { select: { id: true, name: true, code: true } },
  status: true,
  projectManager: { select: userRefSelect },
  createdBy: { select: userRefSelect },
  workItems: { select: { status: { select: { isCompleted: true } } } },
} as const;

const projectDetailInclude = {
  department: { select: { id: true, name: true, code: true } },
  status: true,
  projectManager: { select: userRefSelect },
  createdBy: { select: userRefSelect },
  members: {
    include: { user: { select: userRefSelect } },
    orderBy: { createdAt: 'asc' as const },
  },
  workItems: { select: { status: { select: { isCompleted: true } } } },
} as const;

type UserRef = Parameters<typeof mapUserRef>[0];

function mapProjectListItem(project: {
  id: string;
  name: string;
  key: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  department: { id: string; name: string; code: string } | null;
  status: { id: string; name: string; isActive: boolean };
  projectManager: UserRef;
  createdBy: UserRef;
  workItems: Array<{ status: { isCompleted: boolean } }>;
}) {
  return {
    id: project.id,
    name: project.name,
    key: project.key,
    description: project.description,
    startDate: project.startDate,
    endDate: project.endDate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    department: project.department,
    status: project.status,
    projectManager: mapUserRef(project.projectManager),
    createdBy: mapUserRef(project.createdBy),
    progress: progressFromItems(project.workItems),
  };
}

function mapMembers(
  members: Array<{ id: string; role: ProjectMemberRole; createdAt: Date; user: UserRef }>,
) {
  return members.map((member) => ({
    id: member.id,
    role: member.role,
    createdAt: member.createdAt,
    user: mapUserRef(member.user),
  }));
}

async function assertUserExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!user) throw notFound('User not found');
  if (!user.isActive) throw badRequest('User account is inactive');
}

async function getDefaultProjectStatusId(statusId?: string) {
  if (statusId) {
    const status = await prisma.projectStatus.findUnique({ where: { id: statusId } });
    if (!status || !status.isActive) throw badRequest('Invalid project status');
    return status.id;
  }

  const fallback = await prisma.projectStatus.findFirst({
    where: { isActive: true, isDefault: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!fallback) throw badRequest('No default project status is configured');
  return fallback.id;
}

export const projectsService = {
  async lookups() {
    const [departments, users, projectStatuses, workItemTypes, workItemStatuses] =
      await Promise.all([
        prisma.department.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
        }),
        prisma.user.findMany({
          where: { isActive: true },
          select: userRefSelect,
          orderBy: { email: 'asc' },
          take: 200,
        }),
        prisma.projectStatus.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.workItemType.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.workItemStatus.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
      ]);

    return {
      departments,
      users: users.map(mapUserRef),
      projectStatuses,
      workItemTypes,
      workItemStatuses,
    };
  },

  async list(query: z.infer<typeof paginationSchema>, mineForUserId?: string) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { key: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.statusId ? { statusId: query.statusId } : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
        mineForUserId
          ? {
              OR: [
                { projectManagerId: mineForUserId },
                { members: { some: { userId: mineForUserId } } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: projectListInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map(mapProjectListItem),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: projectDetailInclude,
    });
    if (!project) throw notFound('Project not found');

    return {
      ...mapProjectListItem(project),
      members: mapMembers(project.members),
    };
  },

  async create(
    input: z.infer<typeof createProjectSchema>,
    actor: AuthUser,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    await assertUserExists(input.projectManagerId);
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw notFound('Department not found');
    }

    const statusId = await getDefaultProjectStatusId(input.statusId);
    const key = await uniqueProjectKey(
      (input.key ?? suggestProjectKey(input.name)).toUpperCase(),
    );

    const project = await prisma.project.create({
      data: {
        name: input.name,
        key,
        description: input.description ?? null,
        departmentId: input.departmentId ?? null,
        projectManagerId: input.projectManagerId,
        statusId,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdById: actor.id,
        members: {
          create: {
            userId: input.projectManagerId,
            role: ProjectMemberRole.PROJECT_MANAGER,
          },
        },
      },
      include: projectDetailInclude,
    });

    await logActivity({
      projectId: project.id,
      userId: actor.id,
      action: 'project.created',
      newValue: project.name,
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'CREATE',
      resource: 'projects',
      resourceId: project.id,
      newValues: { id: project.id, name: project.name, key: project.key },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      ...mapProjectListItem(project),
      members: mapMembers(project.members),
    };
  },

  async update(
    id: string,
    input: z.infer<typeof updateProjectSchema>,
    actor: AuthUser,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) throw notFound('Project not found');

    const canUpdate =
      actor.permissions.includes('projects.update') || canManageProject(actor, existing);
    if (!canUpdate) throw forbidden('You cannot update this project');

    if (input.statusId && input.statusId !== existing.statusId) {
      if (!canManageProject(actor, existing)) {
        throw forbidden('You cannot change the project status');
      }
      const status = await prisma.projectStatus.findUnique({ where: { id: input.statusId } });
      if (!status || !status.isActive) throw badRequest('Invalid project status');
    }

    if (input.projectManagerId) await assertUserExists(input.projectManagerId);
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw notFound('Department not found');
    }

    if (input.key && input.key !== existing.key) {
      const clash = await prisma.project.findUnique({ where: { key: input.key } });
      if (clash) throw conflict('Project key already exists');
    }

    const oldStatus =
      input.statusId && input.statusId !== existing.statusId
        ? await prisma.projectStatus.findUnique({ where: { id: existing.statusId } })
        : null;
    const newStatus =
      input.statusId && input.statusId !== existing.statusId
        ? await prisma.projectStatus.findUnique({ where: { id: input.statusId } })
        : null;

    const project = await prisma.project.update({
      where: { id },
      data: {
        name: input.name,
        key: input.key,
        description: input.description,
        departmentId: input.departmentId,
        projectManagerId: input.projectManagerId,
        statusId: input.statusId,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      include: projectDetailInclude,
    });

    if (input.projectManagerId && input.projectManagerId !== existing.projectManagerId) {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: { projectId: id, userId: input.projectManagerId },
        },
        update: { role: ProjectMemberRole.PROJECT_MANAGER },
        create: {
          projectId: id,
          userId: input.projectManagerId,
          role: ProjectMemberRole.PROJECT_MANAGER,
        },
      });
    }

    if (oldStatus && newStatus) {
      await logActivity({
        projectId: id,
        userId: actor.id,
        action: 'project.status_changed',
        oldValue: oldStatus.name,
        newValue: newStatus.name,
      });
    }

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'projects',
      resourceId: id,
      oldValues: { name: existing.name, statusId: existing.statusId },
      newValues: { name: project.name, statusId: project.statusId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      ...mapProjectListItem(project),
      members: mapMembers(project.members),
    };
  },

  async remove(
    id: string,
    actor: AuthUser,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) throw notFound('Project not found');

    await prisma.project.delete({ where: { id } });
    await writeAuditLog({
      userId: actor.id,
      action: 'DELETE',
      resource: 'projects',
      resourceId: id,
      oldValues: { id: existing.id, name: existing.name, key: existing.key },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { id };
  },

  async listMembers(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found');

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: userRefSelect } },
      orderBy: { createdAt: 'asc' },
    });

    return mapMembers(members);
  },

  async addMember(projectId: string, input: z.infer<typeof addMemberSchema>, actor: AuthUser) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found');
    if (!canManageProject(actor, project)) {
      throw forbidden('You cannot manage members on this project');
    }

    await assertUserExists(input.userId);

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: input.userId } },
    });
    if (existing) throw conflict('User is already a project member');

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId: input.userId,
        role: input.role,
      },
      include: { user: { select: userRefSelect } },
    });

    await logActivity({
      projectId,
      userId: actor.id,
      action: 'member.added',
      newValue: mapUserRef(member.user).displayName,
    });

    return {
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      user: mapUserRef(member.user),
    };
  },

  async removeMember(projectId: string, userId: string, actor: AuthUser) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found');
    if (!canManageProject(actor, project)) {
      throw forbidden('You cannot manage members on this project');
    }

    if (userId === project.projectManagerId) {
      throw badRequest('Cannot remove the project manager. Assign a new manager first.');
    }

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { user: { select: userRefSelect } },
    });
    if (!member) throw notFound('Project member not found');

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    await logActivity({
      projectId,
      userId: actor.id,
      action: 'member.removed',
      oldValue: mapUserRef(member.user).displayName,
    });

    return { projectId, userId };
  },

  async listActivity(projectId: string, query: { page: number; pageSize: number }) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found');

    const where = { projectId };
    const [total, items] = await Promise.all([
      prisma.projectActivityLog.count({ where }),
      prisma.projectActivityLog.findMany({
        where,
        include: {
          user: { select: userRefSelect },
          workItem: {
            select: { id: true, number: true, title: true, project: { select: { key: true } } },
          },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map((log) => ({
        id: log.id,
        action: log.action,
        oldValue: log.oldValue,
        newValue: log.newValue,
        createdAt: log.createdAt,
        user: log.user ? mapUserRef(log.user) : null,
        workItem: log.workItem
          ? {
              id: log.workItem.id,
              key: `${log.workItem.project.key}-${log.workItem.number}`,
              title: log.workItem.title,
            }
          : null,
      })),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },
};
