import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination } from '../../utils/helpers';

type ListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
};

const userSelect = {
  id: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    include: { role: { select: { id: true, name: true } } },
  },
  employee: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  },
} as const;

async function syncEmployeeLink(userId: string, employeeId: string | null | undefined) {
  if (employeeId === undefined) return;

  await prisma.employee.updateMany({
    where: { userId },
    data: { userId: null },
  });

  if (!employeeId) return;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw notFound('Employee not found');
  if (employee.userId && employee.userId !== userId) {
    throw conflict('Employee is already linked to another user');
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { userId },
  });
}

function mapUser(user: {
  id: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ role: { id: string; name: string } }>;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles.map((r) => r.role),
    employee: user.employee,
  };
}

export const usersService = {
  async list(query: ListQuery) {
    const where = query.search
      ? { email: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const sortable = new Set(['email', 'createdAt', 'updatedAt', 'lastLoginAt']);
    const sortBy = query.sortBy && sortable.has(query.sortBy) ? query.sortBy : 'createdAt';

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: userSelect,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { [sortBy]: query.sortOrder },
      }),
    ]);

    return {
      items: rows.map(mapUser),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw notFound('User not found');
    return mapUser(user);
  },

  async create(
    input: {
      email: string;
      password: string;
      isActive?: boolean;
      roleIds?: string[];
      employeeId?: string | null;
    },
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('Email already in use');

    if (input.roleIds?.length) {
      const count = await prisma.role.count({ where: { id: { in: input.roleIds } } });
      if (count !== input.roleIds.length) throw notFound('One or more roles not found');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        isActive: input.isActive ?? true,
        roles: input.roleIds?.length
          ? { create: input.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      select: userSelect,
    });

    await syncEmployeeLink(user.id, input.employeeId);

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'users',
      resourceId: user.id,
      newValues: {
        email: user.email,
        isActive: user.isActive,
        roleIds: input.roleIds,
        employeeId: input.employeeId,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.getById(user.id);
  },

  async update(
    id: string,
    input: { email?: string; password?: string; isActive?: boolean; employeeId?: string | null },
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!existing) throw notFound('User not found');

    if (input.email) {
      const email = input.email.toLowerCase();
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) throw conflict('Email already in use');
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        email: input.email?.toLowerCase(),
        isActive: input.isActive,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      },
      select: userSelect,
    });

    if (input.employeeId !== undefined) {
      await syncEmployeeLink(id, input.employeeId);
    }

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'users',
      resourceId: id,
      oldValues: {
        email: existing.email,
        isActive: existing.isActive,
        employeeId: existing.employee?.id ?? null,
      },
      newValues: {
        email: user.email,
        isActive: user.isActive,
        passwordChanged: Boolean(input.password),
        employeeId: input.employeeId,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.getById(id);
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (id === actorId) {
      throw badRequest('You cannot delete your own account');
    }

    const existing = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!existing) throw notFound('User not found');

    await prisma.user.delete({ where: { id } });

    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'users',
      resourceId: id,
      oldValues: { email: existing.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { id };
  },

  async assignRoles(
    id: string,
    roleIds: string[],
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });
    if (!user) throw notFound('User not found');

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw notFound('One or more roles not found');

    const previous = user.roles.map((r) => r.roleId);

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: id } }),
      prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      }),
    ]);

    const added = roleIds.filter((r) => !previous.includes(r));
    const removed = previous.filter((r) => !roleIds.includes(r));

    if (added.length) {
      await writeAuditLog({
        userId: actorId,
        action: 'ROLE_ASSIGNED',
        resource: 'users',
        resourceId: id,
        newValues: { roleIds: added },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
    if (removed.length) {
      await writeAuditLog({
        userId: actorId,
        action: 'ROLE_REMOVED',
        resource: 'users',
        resourceId: id,
        oldValues: { roleIds: removed },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }

    return this.getById(id);
  },
};
