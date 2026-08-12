import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma, TypingTestMode } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { buildPagination } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const TIME_MODE_VALUES = [15, 30, 60, 120] as const;
const WORD_MODE_VALUES = [25, 50, 100] as const;
const TEXT_CATEGORIES = ['general', 'business', 'erp', 'office', 'programming'] as const;

const submitSchema = z.object({
  wpm: z.number().min(0).max(500),
  rawWpm: z.number().min(0).max(500),
  accuracy: z.number().min(0).max(100),
  correctCharacters: z.number().int().min(0).max(50000),
  incorrectCharacters: z.number().int().min(0).max(50000),
  totalCharacters: z.number().int().min(0).max(50000),
  wordsCompleted: z.number().int().min(0).max(10000),
  durationSeconds: z.number().int().min(1).max(7200),
  mode: z.nativeEnum(TypingTestMode),
  modeValue: z.number().int().positive(),
  textCategory: z.enum(TEXT_CATEGORIES),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const leaderboardSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  period: z.enum(['all', 'week', 'month']).default('all'),
  mode: z.nativeEnum(TypingTestMode).optional(),
  modeValue: z.coerce.number().int().positive().optional(),
  textCategory: z.enum(TEXT_CATEGORIES).optional(),
});

const bestSchema = z.object({
  mode: z.nativeEnum(TypingTestMode).optional(),
  modeValue: z.coerce.number().int().positive().optional(),
});

function validateModeValue(mode: TypingTestMode, modeValue: number) {
  if (mode === TypingTestMode.TIME && !(TIME_MODE_VALUES as readonly number[]).includes(modeValue)) {
    throw badRequest('Invalid time mode value');
  }
  if (mode === TypingTestMode.WORDS && !(WORD_MODE_VALUES as readonly number[]).includes(modeValue)) {
    throw badRequest('Invalid word mode value');
  }
}

function validateResultPayload(input: z.infer<typeof submitSchema>) {
  validateModeValue(input.mode, input.modeValue);

  if (input.totalCharacters !== input.correctCharacters + input.incorrectCharacters) {
    throw badRequest('Character counts do not add up');
  }

  if (input.totalCharacters === 0) {
    throw badRequest('No characters typed');
  }

  const expectedAccuracy = (input.correctCharacters / input.totalCharacters) * 100;
  if (Math.abs(expectedAccuracy - input.accuracy) > 2) {
    throw badRequest('Accuracy does not match character counts');
  }

  const minutes = input.durationSeconds / 60;
  const expectedWpm = (input.correctCharacters / 5) / minutes;
  const expectedRawWpm = (input.totalCharacters / 5) / minutes;

  if (Math.abs(expectedWpm - input.wpm) > 3) {
    throw badRequest('WPM does not match submitted data');
  }
  if (Math.abs(expectedRawWpm - input.rawWpm) > 3) {
    throw badRequest('Raw WPM does not match submitted data');
  }

  if (input.mode === TypingTestMode.TIME && input.durationSeconds > input.modeValue + 5) {
    throw badRequest('Duration exceeds time mode limit');
  }
}

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
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctCharacters: number;
  incorrectCharacters: number;
  totalCharacters: number;
  wordsCompleted: number;
  durationSeconds: number;
  mode: TypingTestMode;
  modeValue: number;
  textCategory: string;
  createdAt: Date;
}) {
  return {
    ...result,
    createdAt: result.createdAt.toISOString(),
  };
}

export const typingTestsService = {
  async submit(userId: string, input: z.infer<typeof submitSchema>) {
    validateResultPayload(input);

    const result = await prisma.typingTestResult.create({
      data: {
        userId,
        wpm: input.wpm,
        rawWpm: input.rawWpm,
        accuracy: input.accuracy,
        correctCharacters: input.correctCharacters,
        incorrectCharacters: input.incorrectCharacters,
        totalCharacters: input.totalCharacters,
        wordsCompleted: input.wordsCompleted,
        durationSeconds: input.durationSeconds,
        mode: input.mode,
        modeValue: input.modeValue,
        textCategory: input.textCategory,
      },
    });

    return serializeResult(result);
  },

  async myResults(userId: string, query: z.infer<typeof listSchema>) {
    const where = { userId };
    const [total, items] = await Promise.all([
      prisma.typingTestResult.count({ where }),
      prisma.typingTestResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: items.map(serializeResult),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async myBest(userId: string, query: z.infer<typeof bestSchema>) {
    const where: Prisma.TypingTestResultWhereInput = { userId };
    if (query.mode) where.mode = query.mode;
    if (query.modeValue) where.modeValue = query.modeValue;

    const best = await prisma.typingTestResult.findFirst({
      where,
      orderBy: [{ wpm: 'desc' }, { accuracy: 'desc' }, { createdAt: 'asc' }],
    });

    return best ? serializeResult(best) : null;
  },

  async myStats(userId: string) {
    const [aggregate, recent, history] = await Promise.all([
      prisma.typingTestResult.aggregate({
        where: { userId },
        _avg: { wpm: true, accuracy: true },
        _max: { wpm: true, accuracy: true },
        _count: { id: true },
        _sum: { durationSeconds: true },
      }),
      prisma.typingTestResult.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.typingTestResult.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: 30,
        select: { createdAt: true, wpm: true },
      }),
    ]);

    return {
      bestWpm: aggregate._max.wpm ?? 0,
      averageWpm: aggregate._avg.wpm ?? 0,
      bestAccuracy: aggregate._max.accuracy ?? 0,
      averageAccuracy: aggregate._avg.accuracy ?? 0,
      totalTests: aggregate._count.id,
      totalTypingTimeSeconds: aggregate._sum.durationSeconds ?? 0,
      recentTests: recent.map(serializeResult),
      wpmHistory: history.map((h) => ({
        date: h.createdAt.toISOString().slice(0, 10),
        wpm: h.wpm,
      })),
    };
  },

  async leaderboard(
    viewerUserId: string,
    query: z.infer<typeof leaderboardSchema>,
  ) {
    const start = periodStart(query.period);
    const where: Prisma.TypingTestResultWhereInput = {
      ...(start ? { createdAt: { gte: start } } : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.modeValue ? { modeValue: query.modeValue } : {}),
      ...(query.textCategory ? { textCategory: query.textCategory } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.typingTestResult.count({ where }),
      prisma.typingTestResult.findMany({
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
        orderBy: [{ wpm: 'desc' }, { accuracy: 'desc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const items = rows.map((row, index) => ({
      rank: (query.page - 1) * query.pageSize + index + 1,
      userId: row.userId,
      displayName: displayName(row.user),
      wpm: row.wpm,
      accuracy: row.accuracy,
      mode: row.mode,
      modeValue: row.modeValue,
      textCategory: row.textCategory,
      createdAt: row.createdAt.toISOString(),
    }));

    // Find viewer's global rank for the same filters (best result per user would be ideal but keep simple: best single result)
    let myRank: number | null = null;
    const myBest = await prisma.typingTestResult.findFirst({
      where: { ...where, userId: viewerUserId },
      orderBy: [{ wpm: 'desc' }, { accuracy: 'desc' }, { createdAt: 'asc' }],
    });

    if (myBest) {
      const betterCount = await prisma.typingTestResult.count({
        where: {
          ...where,
          OR: [
            { wpm: { gt: myBest.wpm } },
            {
              wpm: myBest.wpm,
              accuracy: { gt: myBest.accuracy },
            },
            {
              wpm: myBest.wpm,
              accuracy: myBest.accuracy,
              createdAt: { lt: myBest.createdAt },
            },
          ],
        },
      });
      myRank = betterCount + 1;
    }

    return {
      items,
      myRank,
      ...buildPagination(query.page, query.pageSize, total),
    };
  },
};

const router = Router();
router.use(requireAuth);
router.use(requirePermission('typing-tests.view'));

router.post(
  '/results',
  requirePermission('typing-tests.play'),
  validateRequest(submitSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await typingTestsService.submit(req.user!.id, req.body), 201),
  ),
);

router.get(
  '/my-results',
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await typingTestsService.myResults(req.user!.id, req.query as never)),
  ),
);

router.get(
  '/my-best',
  validateRequest(bestSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await typingTestsService.myBest(req.user!.id, req.query as never)),
  ),
);

router.get(
  '/my-stats',
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await typingTestsService.myStats(req.user!.id)),
  ),
);

router.get(
  '/leaderboard',
  validateRequest(leaderboardSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await typingTestsService.leaderboard(req.user!.id, req.query as never),
    ),
  ),
);

export default router;
