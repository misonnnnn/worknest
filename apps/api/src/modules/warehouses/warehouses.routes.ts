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

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

export const warehousesService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: 'insensitive' as const } },
            { name: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [total, items] = await Promise.all([
      prisma.warehouse.count({ where }),
      prisma.warehouse.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },

  async getById(id: string) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw notFound('Warehouse not found');
    return warehouse;
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const code = input.code.trim().toUpperCase();
    const clash = await prisma.warehouse.findUnique({ where: { code } });
    if (clash) throw conflict('Warehouse code already exists');

    if (input.isDefault) {
      await prisma.warehouse.updateMany({ data: { isDefault: false } });
    }

    const warehouse = await prisma.warehouse.create({
      data: { ...input, code },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'warehouses',
      resourceId: warehouse.id,
      newValues: warehouse,
      ...meta,
    });

    return warehouse;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.warehouse.findUnique({ where: { id } });
    if (!existing) throw notFound('Warehouse not found');

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      const clash = await prisma.warehouse.findFirst({
        where: { code, NOT: { id } },
      });
      if (clash) throw conflict('Warehouse code already exists');
      input.code = code;
    }

    if (input.isDefault) {
      await prisma.warehouse.updateMany({
        where: { NOT: { id } },
        data: { isDefault: false },
      });
    }

    const warehouse = await prisma.warehouse.update({ where: { id }, data: input });
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'warehouses',
      resourceId: id,
      oldValues: existing,
      newValues: warehouse,
      ...meta,
    });
    return warehouse;
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: { select: { stockBalances: true, purchaseOrders: true } },
      },
    });
    if (!existing) throw notFound('Warehouse not found');
    if (existing._count.stockBalances > 0 || existing._count.purchaseOrders > 0) {
      throw conflict('Cannot delete a warehouse that has stock or purchase orders');
    }

    await prisma.warehouse.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'warehouses',
      resourceId: id,
      oldValues: existing,
      ...meta,
    });
    return { id };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('warehouses.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await warehousesService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('warehouses.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await warehousesService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('warehouses.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await warehousesService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);
router.patch(
  '/:id',
  requirePermission('warehouses.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await warehousesService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('warehouses.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await warehousesService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
