import type { AuthUser } from '@worknest/types';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination } from '../../utils/helpers';
import {
  canAssignWorkItem,
  canEditWorkItem,
  logActivity,
  mapUserRef,
  userRefSelect,
  workItemKey,
} from './helpers';
import type {
  createCommentSchema,
  createWorkItemSchema,
  myWorkItemsQuerySchema,
  updateWorkItemSchema,
} from './projects.schema';

const workItemInclude = {
  project: { select: { id: true, name: true, key: true, projectManagerId: true } },
  type: true,
  status: true,
  reporter: { select: userRefSelect },
  assignee: { select: userRefSelect },
} as const;

type UserRef = Parameters<typeof mapUserRef>[0];

function mapWorkItem(item: {
  id: string;
  number: number;
  title: string;
  description: string | null;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string; key: string; projectManagerId: string };
  type: { id: string; name: string };
  status: { id: string; name: string; isCompleted: boolean; sortOrder: number };
  reporter: UserRef;
  assignee: UserRef | null;
}) {
  return {
    id: item.id,
    number: item.number,
    key: workItemKey(item.project.key, item.number),
    title: item.title,
    description: item.description,
    priority: item.priority,
    dueDate: item.dueDate,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    project: {
      id: item.project.id,
      name: item.project.name,
      key: item.project.key,
      projectManagerId: item.project.projectManagerId,
    },
    type: item.type,
    status: item.status,
    reporter: mapUserRef(item.reporter),
    assignee: item.assignee ? mapUserRef(item.assignee) : null,
  };
}

async function getDefaultWorkItemStatusId(statusId?: string) {
  if (statusId) {
    const status = await prisma.workItemStatus.findUnique({ where: { id: statusId } });
    if (!status || !status.isActive) throw badRequest('Invalid work item status');
    return status;
  }

  const fallback = await prisma.workItemStatus.findFirst({
    where: { isActive: true, isDefault: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!fallback) throw badRequest('No default work item status is configured');
  return fallback;
}

export const workItemsService = {
  async listByProject(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found');

    const items = await prisma.workItem.findMany({
      where: { projectId },
      include: workItemInclude,
      orderBy: [{ createdAt: 'desc' }],
    });

    return { items: items.map(mapWorkItem) };
  },

  async listMine(userId: string, query: z.infer<typeof myWorkItemsQuerySchema>) {
    const where = {
      assigneeId: userId,
      AND: [
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { project: { key: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {},
        query.statusId ? { statusId: query.statusId } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.workItem.count({ where }),
      prisma.workItem.findMany({
        where,
        include: workItemInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      items: items.map(mapWorkItem),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const item = await prisma.workItem.findUnique({
      where: { id },
      include: workItemInclude,
    });
    if (!item) throw notFound('Work item not found');
    return mapWorkItem(item);
  },

  async create(
    projectId: string,
    input: z.infer<typeof createWorkItemSchema>,
    actor: AuthUser,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found');

    const type = await prisma.workItemType.findUnique({ where: { id: input.typeId } });
    if (!type || !type.isActive) throw badRequest('Invalid work item type');

    if (input.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!assignee || !assignee.isActive) throw badRequest('Invalid assignee');
    }

    const status = await getDefaultWorkItemStatusId(input.statusId);

    const numbered = await prisma.project.update({
      where: { id: projectId },
      data: { nextWorkItemNumber: { increment: 1 } },
      select: { nextWorkItemNumber: true, key: true },
    });
    const number = numbered.nextWorkItemNumber - 1;

    const item = await prisma.workItem.create({
      data: {
        projectId,
        number,
        typeId: input.typeId,
        title: input.title,
        description: input.description ?? null,
        statusId: status.id,
        priority: input.priority,
        reporterId: actor.id,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
      },
      include: workItemInclude,
    });

    const mapped = mapWorkItem(item);

    await logActivity({
      projectId,
      workItemId: item.id,
      userId: actor.id,
      action: 'work_item.created',
      newValue: mapped.key,
    });

    if (item.assigneeId) {
      await logActivity({
        projectId,
        workItemId: item.id,
        userId: actor.id,
        action: 'work_item.assigned',
        newValue: mapped.assignee?.displayName ?? item.assigneeId,
      });
    }

    await writeAuditLog({
      userId: actor.id,
      action: 'CREATE',
      resource: 'work-items',
      resourceId: item.id,
      newValues: { key: mapped.key, title: item.title },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return mapped;
  },

  async update(
    id: string,
    input: z.infer<typeof updateWorkItemSchema>,
    actor: AuthUser,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: workItemInclude,
    });
    if (!existing) throw notFound('Work item not found');

    const canEdit = canEditWorkItem(actor, existing.project);
    const canAssign = canAssignWorkItem(actor, existing.project);

    if (!canEdit && !canAssign) {
      throw forbidden('You cannot edit this work item');
    }

    const data: {
      typeId?: string;
      title?: string;
      description?: string | null;
      statusId?: string;
      priority?: typeof input.priority;
      assigneeId?: string | null;
      dueDate?: Date | null;
    } = {};

    if (canEdit) {
      if (input.typeId) data.typeId = input.typeId;
      if (input.title) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.statusId) data.statusId = input.statusId;
      if (input.priority) data.priority = input.priority;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate ?? null;
    }

    if (canAssign && input.assigneeId !== undefined) {
      data.assigneeId = input.assigneeId;
    } else if (!canAssign && input.assigneeId !== undefined) {
      throw forbidden('You cannot assign this work item');
    }

    if (input.typeId && canEdit) {
      const type = await prisma.workItemType.findUnique({ where: { id: input.typeId } });
      if (!type || !type.isActive) throw badRequest('Invalid work item type');
    }

    let newStatus = existing.status;
    if (input.statusId && canEdit) {
      const status = await prisma.workItemStatus.findUnique({ where: { id: input.statusId } });
      if (!status || !status.isActive) throw badRequest('Invalid work item status');
      newStatus = status;
    }

    if (input.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!assignee || !assignee.isActive) throw badRequest('Invalid assignee');
    }

    const item = await prisma.workItem.update({
      where: { id },
      data,
      include: workItemInclude,
    });

    const mapped = mapWorkItem(item);

    if (input.statusId && input.statusId !== existing.statusId) {
      await logActivity({
        projectId: existing.projectId,
        workItemId: id,
        userId: actor.id,
        action: 'work_item.status_changed',
        oldValue: existing.status.name,
        newValue: newStatus.name,
      });
      if (newStatus.isCompleted && !existing.status.isCompleted) {
        await logActivity({
          projectId: existing.projectId,
          workItemId: id,
          userId: actor.id,
          action: 'work_item.completed',
          newValue: mapped.key,
        });
      }
    }

    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
      await logActivity({
        projectId: existing.projectId,
        workItemId: id,
        userId: actor.id,
        action: 'work_item.assigned',
        oldValue: existing.assignee ? mapUserRef(existing.assignee).displayName : null,
        newValue: mapped.assignee?.displayName ?? null,
      });
    }

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'work-items',
      resourceId: id,
      oldValues: { title: existing.title, statusId: existing.statusId },
      newValues: { title: item.title, statusId: item.statusId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return mapped;
  },

  async remove(
    id: string,
    actor: AuthUser,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: { project: { select: { key: true } } },
    });
    if (!existing) throw notFound('Work item not found');

    await prisma.workItem.delete({ where: { id } });
    await writeAuditLog({
      userId: actor.id,
      action: 'DELETE',
      resource: 'work-items',
      resourceId: id,
      oldValues: {
        key: workItemKey(existing.project.key, existing.number),
        title: existing.title,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { id };
  },

  async listComments(workItemId: string) {
    const item = await prisma.workItem.findUnique({ where: { id: workItemId } });
    if (!item) throw notFound('Work item not found');

    const comments = await prisma.workItemComment.findMany({
      where: { workItemId },
      include: { user: { select: userRefSelect } },
      orderBy: { createdAt: 'asc' },
    });

    return comments.map((comment) => ({
      id: comment.id,
      comment: comment.comment,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: mapUserRef(comment.user),
    }));
  },

  async addComment(
    workItemId: string,
    input: z.infer<typeof createCommentSchema>,
    actor: AuthUser,
  ) {
    const item = await prisma.workItem.findUnique({
      where: { id: workItemId },
      include: { project: { select: { key: true } } },
    });
    if (!item) throw notFound('Work item not found');

    const comment = await prisma.workItemComment.create({
      data: {
        workItemId,
        userId: actor.id,
        comment: input.comment,
      },
      include: { user: { select: userRefSelect } },
    });

    await logActivity({
      projectId: item.projectId,
      workItemId,
      userId: actor.id,
      action: 'comment.added',
      newValue: workItemKey(item.project.key, item.number),
    });

    return {
      id: comment.id,
      comment: comment.comment,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: mapUserRef(comment.user),
    };
  },
};
