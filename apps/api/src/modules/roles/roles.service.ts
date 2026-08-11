import { prisma } from '../../lib/prisma';
import { conflict, notFound, badRequest } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination } from '../../utils/helpers';
import { SUPER_ADMIN_ROLE } from '../../config/permissions';

const roleInclude = {
  permissions: {
    include: {
      permission: {
        select: { id: true, key: true, resource: true, action: true, description: true },
      },
    },
  },
  _count: { select: { users: true } },
} as const;

function mapRole(role: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{
    permission: {
      id: string;
      key: string;
      resource: string;
      action: string;
      description: string | null;
    };
  }>;
  _count: { users: number };
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    userCount: role._count.users,
    permissions: role.permissions.map((p) => p.permission),
  };
}

export const rolesService = {
  async list(query: { page: number; pageSize: number; search?: string }) {
    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [total, rows] = await Promise.all([
      prisma.role.count({ where }),
      prisma.role.findMany({
        where,
        include: roleInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      items: rows.map(mapRole),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw notFound('Role not found');
    return mapRole(role);
  },

  async create(
    input: { name: string; description?: string; permissionIds?: string[] },
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.role.findUnique({ where: { name: input.name } });
    if (existing) throw conflict('Role name already exists');

    if (input.permissionIds?.length) {
      const count = await prisma.permission.count({
        where: { id: { in: input.permissionIds } },
      });
      if (count !== input.permissionIds.length) throw notFound('One or more permissions not found');
    }

    const role = await prisma.role.create({
      data: {
        name: input.name,
        description: input.description,
        permissions: input.permissionIds?.length
          ? { create: input.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      include: roleInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'roles',
      resourceId: role.id,
      newValues: {
        name: role.name,
        description: role.description,
        permissionIds: input.permissionIds,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return mapRole(role);
  },

  async update(
    id: string,
    input: { name?: string; description?: string | null },
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!existing) throw notFound('Role not found');
    if (existing.name === SUPER_ADMIN_ROLE && input.name && input.name !== SUPER_ADMIN_ROLE) {
      throw badRequest('Cannot rename the Super Admin role');
    }

    if (input.name) {
      const clash = await prisma.role.findFirst({
        where: { name: input.name, NOT: { id } },
      });
      if (clash) throw conflict('Role name already exists');
    }

    const role = await prisma.role.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
      },
      include: roleInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'roles',
      resourceId: id,
      oldValues: { name: existing.name, description: existing.description },
      newValues: { name: role.name, description: role.description },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return mapRole(role);
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) throw notFound('Role not found');
    if (existing.name === SUPER_ADMIN_ROLE) {
      throw badRequest('Cannot delete the Super Admin role');
    }

    await prisma.role.delete({ where: { id } });

    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'roles',
      resourceId: id,
      oldValues: { name: existing.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { id };
  },

  async setPermissions(
    id: string,
    permissionIds: string[],
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!existing) throw notFound('Role not found');

    const permissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (permissions.length !== permissionIds.length) {
      throw notFound('One or more permissions not found');
    }

    const previous = existing.permissions.map((p) => p.permissionId);

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      }),
    ]);

    await writeAuditLog({
      userId: actorId,
      action: 'PERMISSION_CHANGED',
      resource: 'roles',
      resourceId: id,
      oldValues: { permissionIds: previous },
      newValues: { permissionIds },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.getById(id);
  },
};
