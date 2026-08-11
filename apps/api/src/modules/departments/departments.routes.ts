import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  name: z.string().min(2).max(150),
  code: z.string().min(2).max(50),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

export const departmentsService = {
  async list(query: z.infer<typeof paginationSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { code: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.isActive === undefined ? {} : { isActive: query.isActive },
      ],
    };

    const [total, items] = await Promise.all([
      prisma.department.count({ where }),
      prisma.department.findMany({
        where,
        include: { _count: { select: { employees: true, positions: true } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      items: items.map((d) => ({
        ...d,
        employeeCount: d._count.employees,
        positionCount: d._count.positions,
        _count: undefined,
      })),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const dept = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, positions: true } } },
    });
    if (!dept) throw notFound('Department not found');
    return {
      ...dept,
      employeeCount: dept._count.employees,
      positionCount: dept._count.positions,
      _count: undefined,
    };
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const clash = await prisma.department.findFirst({
      where: { OR: [{ name: input.name }, { code: input.code }] },
    });
    if (clash) throw conflict('Department name or code already exists');

    const dept = await prisma.department.create({ data: input });
    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'departments',
      resourceId: dept.id,
      newValues: dept,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return dept;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw notFound('Department not found');

    if (input.name || input.code) {
      const clash = await prisma.department.findFirst({
        where: {
          OR: [
            input.name ? { name: input.name } : undefined,
            input.code ? { code: input.code } : undefined,
          ].filter(Boolean) as Array<{ name?: string; code?: string }>,
          NOT: { id },
        },
      });
      if (clash) throw conflict('Department name or code already exists');
    }

    const dept = await prisma.department.update({ where: { id }, data: input });
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'departments',
      resourceId: id,
      oldValues: existing,
      newValues: dept,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return dept;
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, positions: true } } },
    });
    if (!existing) throw notFound('Department not found');
    if (existing._count.employees > 0 || existing._count.positions > 0) {
      throw conflict(
        'Cannot delete a department that still has employees or positions. Reassign them first.',
        {
          employeeCount: existing._count.employees,
          positionCount: existing._count.positions,
        },
      );
    }

    await prisma.department.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'departments',
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
  requirePermission('departments.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await departmentsService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('departments.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await departmentsService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('departments.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await departmentsService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);
router.patch(
  '/:id',
  requirePermission('departments.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await departmentsService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('departments.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await departmentsService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
