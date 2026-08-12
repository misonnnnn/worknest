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
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

export const suppliersService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' as const } },
                { name: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.isActive === undefined ? {} : { isActive: query.isActive },
      ],
    };

    const [total, items] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },

  async getById(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw notFound('Supplier not found');
    return supplier;
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const code = input.code.trim().toUpperCase();
    const clash = await prisma.supplier.findUnique({ where: { code } });
    if (clash) throw conflict('Supplier code already exists');

    const supplier = await prisma.supplier.create({
      data: { ...input, code },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'suppliers',
      resourceId: supplier.id,
      newValues: supplier,
      ...meta,
    });

    return supplier;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw notFound('Supplier not found');

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      const clash = await prisma.supplier.findFirst({
        where: { code, NOT: { id } },
      });
      if (clash) throw conflict('Supplier code already exists');
      input.code = code;
    }

    const supplier = await prisma.supplier.update({ where: { id }, data: input });
    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'suppliers',
      resourceId: id,
      oldValues: existing,
      newValues: supplier,
      ...meta,
    });
    return supplier;
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { purchaseOrders: true } } },
    });
    if (!existing) throw notFound('Supplier not found');
    if (existing._count.purchaseOrders > 0) {
      throw conflict('Cannot delete a supplier that has purchase orders');
    }

    await prisma.supplier.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'suppliers',
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
  requirePermission('suppliers.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await suppliersService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('suppliers.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await suppliersService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('suppliers.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await suppliersService.create(req.body, req.user!.id, getClientMeta(req)), 201),
  ),
);
router.patch(
  '/:id',
  requirePermission('suppliers.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await suppliersService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('suppliers.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await suppliersService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
