import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { buildPagination } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const submitSchema = z.object({
  maxDigits: z.number().int().min(1).max(40),
});

const leaderboardSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  period: z.enum(['all', 'week', 'month']).default('all'),
});

function periodStart(period: 'all' | 'week' | 'month') {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

function displayName(user: {
  email: string;
  employee: { firstName: string; lastName: string } | null;
}) {
  if (user.employee) {
    return `${user.employee.firstName} ${user.employee.lastName.charAt(0)}.`;
  }
  return user.email.split('@')[0] ?? 'User';
}

function serializeResult(result: {
  id: string;
  userId: string;
  maxDigits: number;
  createdAt: Date;
}) {
  return {
    ...result,
    createdAt: result.createdAt.toISOString(),
  };
}

export const numberMemoryService = {
  async submit(userId: string, input: z.infer<typeof submitSchema>) {
    const result = await prisma.numberMemoryResult.create({
      data: {
        userId,
        maxDigits: input.maxDigits,
      },
    });

    return serializeResult(result);
  },

  async myBest(userId: string) {
    const best = await prisma.numberMemoryResult.findFirst({
      where: { userId },
      orderBy: [{ maxDigits: 'desc' }, { createdAt: 'asc' }],
      select: { maxDigits: true },
    });

    return { maxDigits: best?.maxDigits ?? 0 };
  },

  async leaderboard(viewerUserId: string, query: z.infer<typeof leaderboardSchema>) {
    const start = periodStart(query.period);
    const where = start ? { createdAt: { gte: start } } : {};

    const rows = await prisma.numberMemoryResult.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ maxDigits: 'desc' }, { createdAt: 'asc' }],
    });

    const seen = new Set<string>();
    const bests = rows.filter((row) => {
      if (seen.has(row.userId)) return false;
      seen.add(row.userId);
      return true;
    });

    const total = bests.length;
    const pageItems = bests.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    const viewerIndex = bests.findIndex((row) => row.userId === viewerUserId);

    return {
      items: pageItems.map((row, index) => ({
        rank: (query.page - 1) * query.pageSize + index + 1,
        userId: row.userId,
        displayName: displayName(row.user),
        maxDigits: row.maxDigits,
        createdAt: row.createdAt.toISOString(),
      })),
      myRank: viewerIndex === -1 ? null : viewerIndex + 1,
      ...buildPagination(query.page, query.pageSize, total),
    };
  },
};

const router = Router();
router.use(requireAuth);
router.use(requirePermission('number-memory.view'));

router.post(
  '/results',
  requirePermission('number-memory.play'),
  validateRequest(submitSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await numberMemoryService.submit(req.user!.id, req.body), 201),
  ),
);

router.get(
  '/my-best',
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await numberMemoryService.myBest(req.user!.id)),
  ),
);

router.get(
  '/leaderboard',
  validateRequest(leaderboardSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await numberMemoryService.leaderboard(req.user!.id, req.query as never),
    ),
  ),
);

export default router;
