import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { applyStockChange } from '../inventory/stock.helper';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSchema = z.object({
  number: z.string().min(1).max(50).optional(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  orderDate: z.coerce.date(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const updateSchema = z.object({
  supplierId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  orderDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
});

const receiveSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

const poInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  lines: {
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
} as const;

async function nextPoNumber() {
  const count = await prisma.purchaseOrder.count();
  return `PO-${String(count + 1).padStart(5, '0')}`;
}

function computeStatus(lines: Array<{ quantity: number; receivedQty: number }>) {
  const totalOrdered = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalReceived = lines.reduce((sum, line) => sum + line.receivedQty, 0);

  if (totalReceived <= 0) return PurchaseOrderStatus.ORDERED;
  if (totalReceived >= totalOrdered) return PurchaseOrderStatus.RECEIVED;
  return PurchaseOrderStatus.PARTIAL;
}

export const purchasingService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { number: { contains: query.search, mode: 'insensitive' as const } },
                { supplier: { name: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {},
        query.status ? { status: query.status } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { lines: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map((po) => ({
        ...po,
        lineCount: po._count.lines,
        _count: undefined,
      })),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: poInclude,
    });
    if (!po) throw notFound('Purchase order not found');
    return po;
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw notFound('Supplier not found');

    const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw notFound('Warehouse not found');

    for (const line of input.lines) {
      const product = await prisma.product.findUnique({ where: { id: line.productId } });
      if (!product) throw notFound('One or more products not found');
    }

    const number = input.number?.trim() || (await nextPoNumber());
    const clash = await prisma.purchaseOrder.findUnique({ where: { number } });
    if (clash) throw conflict('PO number already exists');

    const po = await prisma.purchaseOrder.create({
      data: {
        number,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        orderDate: input.orderDate,
        notes: input.notes,
        createdById: actorId,
        status: PurchaseOrderStatus.DRAFT,
        lines: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        },
      },
      include: poInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'purchase-orders',
      resourceId: po.id,
      newValues: { number: po.number, status: po.status },
      ...meta,
    });

    return po;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) throw notFound('Purchase order not found');
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw badRequest('Only draft purchase orders can be edited');
    }

    if (input.lines) {
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await prisma.purchaseOrderLine.createMany({
        data: input.lines.map((line) => ({
          purchaseOrderId: id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
    }

    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        orderDate: input.orderDate,
        notes: input.notes,
      },
      include: poInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'purchase-orders',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: po.status },
      ...meta,
    });

    return po;
  },

  async submit(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) throw notFound('Purchase order not found');
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw badRequest('Only draft purchase orders can be submitted');
    }
    if (existing.lines.length === 0) {
      throw badRequest('Purchase order has no lines');
    }

    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ORDERED },
      include: poInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'purchase-orders',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: po.status },
      ...meta,
    });

    return po;
  },

  async cancel(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) throw notFound('Purchase order not found');
    if (
      existing.status === PurchaseOrderStatus.RECEIVED ||
      existing.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw badRequest('This purchase order cannot be cancelled');
    }

    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
      include: poInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'purchase-orders',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: po.status },
      ...meta,
    });

    return po;
  },

  async receive(
    id: string,
    input: z.infer<typeof receiveSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!po) throw notFound('Purchase order not found');

    if (
      po.status !== PurchaseOrderStatus.ORDERED &&
      po.status !== PurchaseOrderStatus.PARTIAL
    ) {
      throw badRequest('Only ordered or partial purchase orders can be received');
    }

    // Receive each requested line, one by one (easy to read/debug)
    for (const receiveLine of input.lines) {
      const line = po.lines.find((item) => item.id === receiveLine.lineId);
      if (!line) throw notFound('Purchase order line not found');

      const remaining = line.quantity - line.receivedQty;
      if (receiveLine.quantity > remaining) {
        throw badRequest(
          `Cannot receive ${receiveLine.quantity}. Remaining for this line: ${remaining}`,
        );
      }

      await applyStockChange({
        warehouseId: po.warehouseId,
        productId: line.productId,
        quantityChange: receiveLine.quantity,
        type: 'IN',
        referenceType: 'purchase_order',
        referenceId: po.id,
        notes: `Received from ${po.number}`,
        createdById: actorId,
      });

      await prisma.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: line.receivedQty + receiveLine.quantity },
      });
    }

    const refreshedLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id },
    });
    const status = computeStatus(refreshedLines);

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { status },
      include: poInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'purchase-orders',
      resourceId: id,
      newValues: { status: updated.status, received: input.lines },
      ...meta,
    });

    return updated;
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('purchasing.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await purchasingService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('purchasing.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await purchasingService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('purchasing.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await purchasingService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);
router.patch(
  '/:id',
  requirePermission('purchasing.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await purchasingService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/submit',
  requirePermission('purchasing.update'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await purchasingService.submit(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/cancel',
  requirePermission('purchasing.update'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await purchasingService.cancel(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/receive',
  requirePermission('purchasing.receive'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(receiveSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await purchasingService.receive(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
