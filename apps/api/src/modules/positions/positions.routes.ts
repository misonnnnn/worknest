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
  departmentId: z.string().uuid().optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  title: z.string().min(2).max(150),
  code: z.string().min(2).max(50),
  description: z.string().max(500).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial();

const include = {
  department: { select: { id: true, name: true, code: true } },
  _count: { select: { employees: true } },
} as const;

export const positionsService = {
  async list(query: z.infer<typeof paginationSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { code: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.position.count({ where }),
      prisma.position.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { title: 'asc' },
      }),
    ]);

    return {
      items: items.map((p) => ({
        ...p,
        employeeCount: p._count.employees,
        _count: undefined,
      })),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const position = await prisma.position.findUnique({ where: { id }, include });
    if (!position) throw notFound('Position not found');
    return {
      ...position,
      employeeCount: position._count.employees,
      _count: undefined,
    };
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const clash = await prisma.position.findUnique({ where: { code: input.code } });
    if (clash) throw conflict('Position code already exists');

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw notFound('Department not found');
    }

    const position = await prisma.position.create({ data: input, include });
    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'positions',
      resourceId: position.id,
      newValues: position,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return {
      ...position,
      employeeCount: position._count.employees,
      _count: undefined,
    };
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.position.findUnique({ where: { id } });
    if (!existing) throw notFound('Position not found');

    if (input.code) {
      const clash = await prisma.position.findFirst({
        where: { code: input.code, NOT: { id } },
      });
      if (clash) throw conflict('Position code already exists');
    }

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw notFound('Department not found');
    }

    const position = await prisma.position.update({ where: { id }, data: input, include });
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'positions',
      resourceId: id,
      oldValues: existing,
      newValues: position,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return {
      ...position,
      employeeCount: position._count.employees,
      _count: undefined,
    };
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.position.findUnique({ where: { id } });
    if (!existing) throw notFound('Position not found');
    await prisma.position.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'positions',
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
  requirePermission('positions.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await positionsService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('positions.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await positionsService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('positions.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await positionsService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);
router.patch(
  '/:id',
  requirePermission('positions.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await positionsService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('positions.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await positionsService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
