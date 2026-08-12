import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { applyStockChange } from './stock.helper';

const stockListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  warehouseId: z.string().uuid().optional(),
});

const movementListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

const adjustSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  // positive adds stock, negative removes stock
  quantityChange: z.number().int().refine((n) => n !== 0, 'Cannot be zero'),
  notes: z.string().max(500).optional(),
});

export const inventoryService = {
  async listStock(query: z.infer<typeof stockListSchema>) {
    const where = {
      AND: [
        query.warehouseId ? { warehouseId: query.warehouseId } : {},
        query.search
          ? {
              OR: [
                { product: { name: { contains: query.search, mode: 'insensitive' as const } } },
                { product: { sku: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.stockBalance.count({ where }),
      prisma.stockBalance.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },

  async listMovements(query: z.infer<typeof movementListSchema>) {
    const where = {
      AND: [
        query.warehouseId ? { warehouseId: query.warehouseId } : {},
        query.productId ? { productId: query.productId } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },

  async adjust(
    input: z.infer<typeof adjustSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const result = await applyStockChange({
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantityChange: input.quantityChange,
      type: 'ADJUST',
      referenceType: 'manual',
      notes: input.notes,
      createdById: actorId,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'inventory',
      resourceId: result.balance.id,
      newValues: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantityChange: input.quantityChange,
        quantity: result.balance.quantity,
      },
      ...meta,
    });

    return result;
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/stock',
  requirePermission('inventory.view'),
  validateRequest(stockListSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await inventoryService.listStock(req.query as never)),
  ),
);

router.get(
  '/movements',
  requirePermission('inventory.view'),
  validateRequest(movementListSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await inventoryService.listMovements(req.query as never)),
  ),
);

router.post(
  '/adjust',
  requirePermission('inventory.adjust'),
  validateRequest(adjustSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await inventoryService.adjust(req.body, req.user!.id, getClientMeta(req))),
  ),
);

export default router;
