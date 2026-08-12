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
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  unit: z.string().min(1).max(20).optional().default('pcs'),
  trackInventory: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

export const productsService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' as const } },
                { name: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.isActive === undefined ? {} : { isActive: query.isActive },
      ],
    };

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },

  async getById(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw notFound('Product not found');
    return product;
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const sku = input.sku.trim().toUpperCase();
    const clash = await prisma.product.findUnique({ where: { sku } });
    if (clash) throw conflict('SKU already exists');

    const product = await prisma.product.create({
      data: { ...input, sku },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'products',
      resourceId: product.id,
      newValues: product,
      ...meta,
    });

    return product;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('Product not found');

    if (input.sku) {
      const sku = input.sku.trim().toUpperCase();
      const clash = await prisma.product.findFirst({
        where: { sku, NOT: { id } },
      });
      if (clash) throw conflict('SKU already exists');
      input.sku = sku;
    }

    const product = await prisma.product.update({
      where: { id },
      data: input,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'products',
      resourceId: id,
      oldValues: existing,
      newValues: product,
      ...meta,
    });

    return product;
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('Product not found');

    await prisma.product.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'products',
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
  requirePermission('products.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await productsService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('products.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await productsService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('products.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await productsService.create(req.body, req.user!.id, getClientMeta(req)), 201),
  ),
);
router.patch(
  '/:id',
  requirePermission('products.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await productsService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('products.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await productsService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
