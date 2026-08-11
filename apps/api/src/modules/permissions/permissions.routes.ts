import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { buildPagination } from '../../utils/helpers';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().optional(),
  resource: z.string().optional(),
});

export const permissionsService = {
  async list(query: z.infer<typeof querySchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { key: { contains: query.search, mode: 'insensitive' as const } },
                { description: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
        query.resource ? { resource: query.resource } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.permission.count({ where }),
      prisma.permission.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('permissions.view'),
  validateRequest(querySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await permissionsService.list(req.query as never));
  }),
);

export default router;
