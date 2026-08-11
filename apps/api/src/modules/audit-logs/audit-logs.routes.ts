import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { buildPagination } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.nativeEnum(AuditAction).optional(),
  resource: z.string().optional(),
  userId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const auditLogsService = {
  async list(query: z.infer<typeof querySchema>) {
    const where = {
      AND: [
        query.action ? { action: query.action } : {},
        query.resource ? { resource: query.resource } : {},
        query.userId ? { userId: query.userId } : {},
        query.search
          ? {
              OR: [
                { resource: { contains: query.search, mode: 'insensitive' as const } },
                { resourceId: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, email: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { items, ...buildPagination(query.page, query.pageSize, total) };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('audit-logs.view'),
  validateRequest(querySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await auditLogsService.list(req.query as never)),
  ),
);

export default router;
