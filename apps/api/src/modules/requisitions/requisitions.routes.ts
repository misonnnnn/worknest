import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { PurchaseOrderStatus, PurchaseRequisitionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(PurchaseRequisitionStatus).optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().max(200).optional().nullable(),
});

const createSchema = z.object({
  departmentId: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const updateSchema = z.object({
  departmentId: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

const convertSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  orderDate: z.coerce.date(),
  // unit price for each requisition line (needed because PR has no prices)
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
});

const prInclude = {
  requestedBy: { select: { id: true, email: true } },
  approvedBy: { select: { id: true, email: true } },
  department: { select: { id: true, code: true, name: true } },
  lines: {
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
  purchaseOrders: { select: { id: true, number: true, status: true } },
} as const;

async function nextPrNumber() {
  const count = await prisma.purchaseRequisition.count();
  return `PR-${String(count + 1).padStart(5, '0')}`;
}

async function nextPoNumber() {
  const count = await prisma.purchaseOrder.count();
  return `PO-${String(count + 1).padStart(5, '0')}`;
}

export const requisitionsService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { number: { contains: query.search, mode: 'insensitive' as const } },
                { notes: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.status ? { status: query.status } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.purchaseRequisition.count({ where }),
      prisma.purchaseRequisition.findMany({
        where,
        include: {
          requestedBy: { select: { id: true, email: true } },
          department: { select: { id: true, code: true, name: true } },
          _count: { select: { lines: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map((pr) => ({
        ...pr,
        lineCount: pr._count.lines,
        _count: undefined,
      })),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const pr = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: prInclude,
    });
    if (!pr) throw notFound('Purchase requisition not found');
    return pr;
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw notFound('Department not found');
    }

    for (const line of input.lines) {
      const product = await prisma.product.findUnique({ where: { id: line.productId } });
      if (!product) throw notFound('One or more products not found');
    }

    const number = await nextPrNumber();

    const pr = await prisma.purchaseRequisition.create({
      data: {
        number,
        requestedById: actorId,
        departmentId: input.departmentId,
        notes: input.notes,
        status: PurchaseRequisitionStatus.DRAFT,
        lines: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            notes: line.notes,
          })),
        },
      },
      include: prInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'requisitions',
      resourceId: pr.id,
      newValues: { number: pr.number, status: pr.status },
      ...meta,
    });

    return pr;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!existing) throw notFound('Purchase requisition not found');
    if (existing.status !== PurchaseRequisitionStatus.DRAFT) {
      throw badRequest('Only draft requisitions can be edited');
    }

    if (input.lines) {
      await prisma.purchaseRequisitionLine.deleteMany({ where: { requisitionId: id } });
      await prisma.purchaseRequisitionLine.createMany({
        data: input.lines.map((line) => ({
          requisitionId: id,
          productId: line.productId,
          quantity: line.quantity,
          notes: line.notes ?? null,
        })),
      });
    }

    const pr = await prisma.purchaseRequisition.update({
      where: { id },
      data: {
        departmentId: input.departmentId,
        notes: input.notes,
      },
      include: prInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'requisitions',
      resourceId: id,
      newValues: { number: pr.number },
      ...meta,
    });

    return pr;
  },

  async submit(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) throw notFound('Purchase requisition not found');
    if (existing.status !== PurchaseRequisitionStatus.DRAFT) {
      throw badRequest('Only draft requisitions can be submitted');
    }
    if (existing.lines.length === 0) {
      throw badRequest('Requisition has no lines');
    }

    const pr = await prisma.purchaseRequisition.update({
      where: { id },
      data: { status: PurchaseRequisitionStatus.SUBMITTED },
      include: prInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'requisitions',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: pr.status },
      ...meta,
    });

    return pr;
  },

  async approve(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!existing) throw notFound('Purchase requisition not found');
    if (existing.status !== PurchaseRequisitionStatus.SUBMITTED) {
      throw badRequest('Only submitted requisitions can be approved');
    }

    const pr = await prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: PurchaseRequisitionStatus.APPROVED,
        approvedById: actorId,
        approvedAt: new Date(),
        rejectReason: null,
      },
      include: prInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'requisitions',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: pr.status },
      ...meta,
    });

    return pr;
  },

  async reject(
    id: string,
    input: z.infer<typeof rejectSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!existing) throw notFound('Purchase requisition not found');
    if (existing.status !== PurchaseRequisitionStatus.SUBMITTED) {
      throw badRequest('Only submitted requisitions can be rejected');
    }

    const pr = await prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: PurchaseRequisitionStatus.REJECTED,
        approvedById: actorId,
        approvedAt: new Date(),
        rejectReason: input.reason,
      },
      include: prInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'requisitions',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: pr.status, rejectReason: input.reason },
      ...meta,
    });

    return pr;
  },

  async cancel(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!existing) throw notFound('Purchase requisition not found');
    if (
      existing.status !== PurchaseRequisitionStatus.DRAFT &&
      existing.status !== PurchaseRequisitionStatus.SUBMITTED
    ) {
      throw badRequest('Only draft or submitted requisitions can be cancelled');
    }

    const pr = await prisma.purchaseRequisition.update({
      where: { id },
      data: { status: PurchaseRequisitionStatus.CANCELLED },
      include: prInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'requisitions',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: pr.status },
      ...meta,
    });

    return pr;
  },

  async convertToPo(
    id: string,
    input: z.infer<typeof convertSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const pr = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!pr) throw notFound('Purchase requisition not found');
    if (pr.status !== PurchaseRequisitionStatus.APPROVED) {
      throw badRequest('Only approved requisitions can be converted to a purchase order');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw notFound('Supplier not found');

    const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw notFound('Warehouse not found');

    // Build PO lines from requisition lines + prices from the convert form
    const poLines: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
    for (const priceLine of input.lines) {
      const prLine = pr.lines.find((line) => line.id === priceLine.lineId);
      if (!prLine) throw notFound('Requisition line not found');
      poLines.push({
        productId: prLine.productId,
        quantity: prLine.quantity,
        unitPrice: priceLine.unitPrice,
      });
    }

    if (poLines.length !== pr.lines.length) {
      throw badRequest('Provide a unit price for every requisition line');
    }

    const poNumber = await nextPoNumber();
    const clash = await prisma.purchaseOrder.findUnique({ where: { number: poNumber } });
    if (clash) throw conflict('PO number already exists');

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          number: poNumber,
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          requisitionId: pr.id,
          orderDate: input.orderDate,
          notes: pr.notes ? `From ${pr.number}: ${pr.notes}` : `From ${pr.number}`,
          createdById: actorId,
          status: PurchaseOrderStatus.DRAFT,
          lines: {
            create: poLines,
          },
        },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          lines: {
            include: {
              product: { select: { id: true, sku: true, name: true, unit: true } },
            },
          },
        },
      });

      const updatedPr = await tx.purchaseRequisition.update({
        where: { id: pr.id },
        data: { status: PurchaseRequisitionStatus.CONVERTED },
        include: prInclude,
      });

      return { purchaseOrder: po, requisition: updatedPr };
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'requisitions',
      resourceId: id,
      newValues: {
        status: PurchaseRequisitionStatus.CONVERTED,
        purchaseOrderId: result.purchaseOrder.id,
        purchaseOrderNumber: result.purchaseOrder.number,
      },
      ...meta,
    });

    return result;
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('requisitions.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await requisitionsService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('requisitions.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await requisitionsService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('requisitions.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);
router.patch(
  '/:id',
  requirePermission('requisitions.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/submit',
  requirePermission('requisitions.update'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.submit(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/approve',
  requirePermission('requisitions.approve'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.approve(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/reject',
  requirePermission('requisitions.approve'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(rejectSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.reject(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/cancel',
  requirePermission('requisitions.update'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.cancel(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.post(
  '/:id/convert',
  requirePermission('purchasing.create'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(convertSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await requisitionsService.convertToPo(
        req.params.id!,
        req.body,
        req.user!.id,
        getClientMeta(req),
      ),
      201,
    ),
  ),
);

export default router;
