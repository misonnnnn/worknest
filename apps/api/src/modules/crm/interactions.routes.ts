import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  CrmChannel,
  CrmInteractionStatus,
  CrmInteractionType,
  CrmPriority,
  CrmResolution,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import {
  csvEscape,
  customerSearchWhere,
  endOfDay,
  formatDuration,
  interactionInclude,
  mapInteraction,
  mapUserRef,
  nextInteractionNumber,
  parseDuration,
  startOfDay,
  userRefSelect,
} from './helpers';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  customerId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  status: z.nativeEnum(CrmInteractionStatus).optional(),
  priority: z.nativeEnum(CrmPriority).optional(),
  channel: z.nativeEnum(CrmChannel).optional(),
  interactionType: z.nativeEnum(CrmInteractionType).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const followUpInputSchema = z.object({
  followUpDate: z.coerce.date(),
  followUpType: z.enum(['CALL', 'EMAIL', 'VISIT', 'OTHER']).optional().default('CALL'),
  assignedToId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const createSchema = z.object({
  customerId: z.string().uuid(),
  caseId: z.string().uuid().optional().nullable(),
  agentId: z.string().uuid().optional(),
  channel: z.nativeEnum(CrmChannel),
  interactionType: z.nativeEnum(CrmInteractionType),
  interactionDate: z.coerce.date().optional(),
  duration: z.union([z.string(), z.number()]).optional().nullable(),
  inquiry: z.string().min(1).max(4000),
  notes: z.string().max(8000).optional().nullable(),
  resolution: z.nativeEnum(CrmResolution).optional().nullable(),
  status: z.nativeEnum(CrmInteractionStatus).optional().default('COMPLETED'),
  priority: z.nativeEnum(CrmPriority).optional().default('NORMAL'),
  followUp: followUpInputSchema.optional().nullable(),
});

const updateSchema = createSchema.partial().omit({ followUp: true });

const commentSchema = z.object({
  comment: z.string().min(1).max(2000),
});

function listWhere(query: z.infer<typeof listSchema>) {
  const dateFrom = query.dateFrom ? startOfDay(new Date(query.dateFrom)) : undefined;
  const dateTo = query.dateTo ? endOfDay(new Date(query.dateTo)) : undefined;

  return {
    AND: [
      query.search
        ? {
            OR: [
              { interactionNumber: { contains: query.search, mode: 'insensitive' as const } },
              { inquiry: { contains: query.search, mode: 'insensitive' as const } },
              { notes: { contains: query.search, mode: 'insensitive' as const } },
              { case: { caseNumber: { contains: query.search, mode: 'insensitive' as const } } },
              { customer: customerSearchWhere(query.search) },
            ],
          }
        : {},
      query.customerId ? { customerId: query.customerId } : {},
      query.caseId ? { caseId: query.caseId } : {},
      query.agentId ? { agentId: query.agentId } : {},
      query.status ? { status: query.status } : {},
      query.priority ? { priority: query.priority } : {},
      query.channel ? { channel: query.channel } : {},
      query.interactionType ? { interactionType: query.interactionType } : {},
      dateFrom || dateTo
        ? {
            interactionDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {},
    ],
  };
}

async function assertCustomer(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!customer) throw notFound('Customer not found');
}

async function assertCase(id: string | null | undefined, customerId?: string) {
  if (!id) return;
  const crmCase = await prisma.crmCase.findUnique({ where: { id } });
  if (!crmCase) throw notFound('Case not found');
  if (customerId && crmCase.customerId !== customerId) {
    throw badRequest('Case does not belong to this customer');
  }
}

async function assertAgent(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!user) throw notFound('Agent not found');
}

export const interactionsService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = listWhere(query);
    const [total, items] = await Promise.all([
      prisma.crmInteraction.count({ where }),
      prisma.crmInteraction.findMany({
        where,
        include: interactionInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { interactionDate: 'desc' },
      }),
    ]);

    return {
      items: items.map(mapInteraction),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async exportCsv(query: z.infer<typeof listSchema>) {
    const items = await prisma.crmInteraction.findMany({
      where: listWhere(query),
      include: interactionInclude,
      orderBy: { interactionDate: 'desc' },
      take: 5000,
    });

    const header = [
      'Case ID',
      'Interaction ID',
      'Date',
      'Customer',
      'Store',
      'Phone',
      'Email',
      'Channel',
      'Interaction Type',
      'Inquiry',
      'Agent',
      'Duration',
      'Priority',
      'Status',
      'Resolution',
    ];

    const rows = items.map((item) => {
      const mapped = mapInteraction(item);
      return [
        item.case?.caseNumber ?? '',
        item.interactionNumber,
        item.interactionDate.toISOString(),
        item.customer.name,
        item.customer.storeName ?? '',
        item.customer.phone ?? '',
        item.customer.email ?? '',
        item.channel,
        item.interactionType,
        item.inquiry ?? '',
        mapped.agent?.displayName ?? '',
        formatDuration(item.durationSeconds) ?? '',
        item.priority,
        item.status,
        item.resolution ?? '',
      ].map(csvEscape);
    });

    return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  },

  async getById(id: string) {
    const item = await prisma.crmInteraction.findUnique({
      where: { id },
      include: {
        ...interactionInclude,
        followUps: {
          include: { assignedTo: { select: userRefSelect } },
          orderBy: { followUpDate: 'desc' },
        },
        comments: {
          include: { user: { select: userRefSelect } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!item) throw notFound('Interaction not found');

    const { followUps, comments, ...rest } = item;
    return {
      ...mapInteraction(rest),
      followUps: followUps.map((f) => ({ ...f, assignedTo: mapUserRef(f.assignedTo) })),
      comments: comments.map((c) => ({
        id: c.id,
        comment: c.comment,
        createdAt: c.createdAt,
        user: mapUserRef(c.user),
      })),
    };
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    await assertCustomer(input.customerId);
    await assertCase(input.caseId, input.customerId);
    const agentId = input.agentId ?? actorId;
    await assertAgent(agentId);

    const durationSeconds = parseDuration(input.duration);
    if (input.duration != null && input.duration !== '' && durationSeconds === null) {
      throw badRequest('Duration must look like 2:16 or a number of seconds');
    }

    const created = await prisma.$transaction(async (tx) => {
      const interaction = await tx.crmInteraction.create({
        data: {
          interactionNumber: await nextInteractionNumber(),
          customerId: input.customerId,
          caseId: input.caseId || null,
          agentId,
          channel: input.channel,
          interactionType: input.interactionType,
          interactionDate: input.interactionDate ?? new Date(),
          durationSeconds,
          inquiry: input.inquiry.trim(),
          notes: input.notes?.trim() || null,
          resolution: input.resolution ?? null,
          status: input.status ?? 'COMPLETED',
          priority: input.priority ?? 'NORMAL',
        },
        include: interactionInclude,
      });

      if (input.followUp) {
        await tx.crmFollowUp.create({
          data: {
            interactionId: interaction.id,
            customerId: input.customerId,
            caseId: input.caseId || null,
            assignedToId: input.followUp.assignedToId ?? agentId,
            followUpDate: input.followUp.followUpDate,
            followUpType: input.followUp.followUpType ?? 'CALL',
            notes: input.followUp.notes?.trim() || null,
          },
        });
      }

      return interaction;
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'crm-interactions',
      resourceId: created.id,
      newValues: { id: created.id, interactionNumber: created.interactionNumber },
      ...meta,
    });

    return mapInteraction(created);
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.crmInteraction.findUnique({ where: { id } });
    if (!existing) throw notFound('Interaction not found');

    if (input.customerId) await assertCustomer(input.customerId);
    const customerId = input.customerId ?? existing.customerId;
    if (input.caseId !== undefined) await assertCase(input.caseId, customerId);
    if (input.agentId) await assertAgent(input.agentId);

    let durationSeconds: number | null | undefined;
    if (input.duration !== undefined) {
      durationSeconds = parseDuration(input.duration);
      if (input.duration != null && input.duration !== '' && durationSeconds === null) {
        throw badRequest('Duration must look like 2:16 or a number of seconds');
      }
    }

    const updated = await prisma.crmInteraction.update({
      where: { id },
      data: {
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.caseId !== undefined ? { caseId: input.caseId || null } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.interactionType ? { interactionType: input.interactionType } : {}),
        ...(input.interactionDate ? { interactionDate: input.interactionDate } : {}),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(input.inquiry !== undefined ? { inquiry: input.inquiry.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
      },
      include: interactionInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'crm-interactions',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
      ...meta,
    });

    return mapInteraction(updated);
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.crmInteraction.findUnique({ where: { id } });
    if (!existing) throw notFound('Interaction not found');

    await prisma.crmInteraction.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'crm-interactions',
      resourceId: id,
      oldValues: existing,
      ...meta,
    });
    return { id };
  },

  async addComment(
    id: string,
    comment: string,
    actorId: string,
  ) {
    const existing = await prisma.crmInteraction.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('Interaction not found');

    const created = await prisma.crmLogComment.create({
      data: { interactionId: id, userId: actorId, comment: comment.trim() },
      include: { user: { select: userRefSelect } },
    });

    return {
      id: created.id,
      comment: created.comment,
      createdAt: created.createdAt,
      user: mapUserRef(created.user),
    };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('crm.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await interactionsService.list(req.query as never)),
  ),
);

router.get(
  '/export',
  requirePermission('crm.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const csv = await interactionsService.exportCsv(req.query as never);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="crm-interactions.csv"');
    res.send(csv);
  }),
);

router.get(
  '/:id',
  requirePermission('crm.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await interactionsService.getById(req.params.id!)),
  ),
);

router.post(
  '/',
  requirePermission('crm.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await interactionsService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);

router.patch(
  '/:id',
  requirePermission('crm.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await interactionsService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);

router.delete(
  '/:id',
  requirePermission('crm.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await interactionsService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

router.post(
  '/:id/comments',
  requireAnyPermission('crm.create', 'crm.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(commentSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await interactionsService.addComment(req.params.id!, req.body.comment, req.user!.id),
      201,
    ),
  ),
);

export default router;
