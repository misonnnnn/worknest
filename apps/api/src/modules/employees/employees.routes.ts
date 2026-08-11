import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { EmploymentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  employmentStatus: z.nativeEnum(EmploymentStatus).optional(),
  sortBy: z.enum(['hireDate', 'lastName', 'employeeNumber', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  employeeNumber: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  hireDate: z.coerce.date(),
  employmentStatus: z.nativeEnum(EmploymentStatus).optional().default(EmploymentStatus.ACTIVE),
  userId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  positionId: z.string().uuid().optional().nullable(),
  managerId: z.string().uuid().optional().nullable(),
});

const updateSchema = createSchema.partial();

const include = {
  department: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, title: true, code: true } },
  manager: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  },
  user: { select: { id: true, email: true } },
} as const;

async function assertRefs(input: {
  userId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  selfId?: string;
}) {
  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw notFound('Linked user not found');
    const taken = await prisma.employee.findFirst({
      where: {
        userId: input.userId,
        ...(input.selfId ? { NOT: { id: input.selfId } } : {}),
      },
    });
    if (taken) throw conflict('User is already linked to another employee');
  }
  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw notFound('Department not found');
  }
  if (input.positionId) {
    const position = await prisma.position.findUnique({ where: { id: input.positionId } });
    if (!position) throw notFound('Position not found');
  }
  if (input.managerId) {
    if (input.selfId && input.managerId === input.selfId) {
      throw badRequest('Employee cannot be their own manager');
    }
    const manager = await prisma.employee.findUnique({ where: { id: input.managerId } });
    if (!manager) throw notFound('Manager not found');
  }
}

export const employeesService = {
  async list(query: z.infer<typeof paginationSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' as const } },
                { lastName: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { employeeNumber: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.positionId ? { positionId: query.positionId } : {},
        query.employmentStatus ? { employmentStatus: query.employmentStatus } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { [query.sortBy]: query.sortOrder },
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },

  async getById(id: string) {
    const employee = await prisma.employee.findUnique({ where: { id }, include });
    if (!employee) throw notFound('Employee not found');
    return employee;
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const email = input.email.toLowerCase();
    const clash = await prisma.employee.findFirst({
      where: {
        OR: [{ email }, { employeeNumber: input.employeeNumber }],
      },
    });
    if (clash) throw conflict('Employee number or email already exists');

    await assertRefs(input);

    const employee = await prisma.employee.create({
      data: { ...input, email },
      include,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'employees',
      resourceId: employee.id,
      newValues: employee,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return employee;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) throw notFound('Employee not found');

    if (input.email || input.employeeNumber) {
      const clash = await prisma.employee.findFirst({
        where: {
          OR: [
            input.email ? { email: input.email.toLowerCase() } : undefined,
            input.employeeNumber ? { employeeNumber: input.employeeNumber } : undefined,
          ].filter(Boolean) as Array<{ email?: string; employeeNumber?: string }>,
          NOT: { id },
        },
      });
      if (clash) throw conflict('Employee number or email already exists');
    }

    await assertRefs({ ...input, selfId: id });

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...input,
        email: input.email ? input.email.toLowerCase() : undefined,
      },
      include,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'employees',
      resourceId: id,
      oldValues: existing,
      newValues: employee,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return employee;
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) throw notFound('Employee not found');
    await prisma.employee.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'employees',
      resourceId: id,
      oldValues: existing,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { id };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('employees.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await employeesService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('employees.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await employeesService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('employees.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await employeesService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);
router.patch(
  '/:id',
  requirePermission('employees.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await employeesService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('employees.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await employeesService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
