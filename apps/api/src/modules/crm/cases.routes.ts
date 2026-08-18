import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { CrmCaseStatus, CrmPriority } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import {
  caseInclude,
  customerSearchWhere,
  interactionInclude,
  mapCase,
  mapFollowUp,
  mapInteraction,
  mapUserRef,
  nextCaseNumber,
  userRefSelect,
  followUpInclude,
} from './helpers';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  customerId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  status: z.nativeEnum(CrmCaseStatus).optional(),
  priority: z.nativeEnum(CrmPriority).optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  customerId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  priority: z.nativeEnum(CrmPriority).optional().default('NORMAL'),
  status: z.nativeEnum(CrmCaseStatus).optional().default('OPEN'),
  assignedToId: z.string().uuid().optional().nullable(),
});

const updateSchema = createSchema.partial().omit({ customerId: true });

const CLOSED_STATUSES: CrmCaseStatus[] = ['RESOLVED', 'CLOSED', 'CANCELLED'];

export const casesService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { caseNumber: { contains: query.search, mode: 'insensitive' as const } },
                { subject: { contains: query.search, mode: 'insensitive' as const } },
                { description: { contains: query.search, mode: 'insensitive' as const } },
                { customer: customerSearchWhere(query.search) },
              ],
            }
          : {},
        query.customerId ? { customerId: query.customerId } : {},
        query.assignedToId ? { assignedToId: query.assignedToId } : {},
        query.status ? { status: query.status } : {},
        query.priority ? { priority: query.priority } : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.crmCase.count({ where }),
      prisma.crmCase.findMany({
        where,
        include: caseInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map(mapCase),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const crmCase = await prisma.crmCase.findUnique({
      where: { id },
      include: {
        ...caseInclude,
        interactions: {
          include: interactionInclude,
          orderBy: { interactionDate: 'desc' },
        },
        followUps: {
          include: followUpInclude,
          orderBy: { followUpDate: 'desc' },
        },
      },
    });
    if (!crmCase) throw notFound('Case not found');

    const { interactions, followUps, assignedTo, _count, ...rest } = crmCase;
    return {
      ...rest,
      assignedTo: mapUserRef(assignedTo),
      interactionCount: _count.interactions,
      followUpCount: _count.followUps,
      interactions: interactions.map(mapInteraction),
      followUps: followUps.map(mapFollowUp),
    };
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw notFound('Customer not found');
    if (input.assignedToId) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedToId } });
      if (!user) throw notFound('Assigned user not found');
    }

    const created = await prisma.crmCase.create({
      data: {
        caseNumber: await nextCaseNumber(),
        customerId: input.customerId,
        subject: input.subject.trim(),
        description: input.description?.trim() || null,
        priority: input.priority ?? 'NORMAL',
        status: input.status ?? 'OPEN',
        assignedToId: input.assignedToId || actorId,
        closedAt: CLOSED_STATUSES.includes(input.status ?? 'OPEN') ? new Date() : null,
      },
      include: caseInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'crm-cases',
      resourceId: created.id,
      newValues: created,
      ...meta,
    });

    return mapCase(created);
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.crmCase.findUnique({ where: { id } });
    if (!existing) throw notFound('Case not found');
    if (input.assignedToId) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedToId } });
      if (!user) throw notFound('Assigned user not found');
    }

    const nextStatus = input.status ?? existing.status;
    const closing = CLOSED_STATUSES.includes(nextStatus);
    const wasOpen = !CLOSED_STATUSES.includes(existing.status);

    const updated = await prisma.crmCase.update({
      where: { id },
      data: {
        ...(input.subject !== undefined ? { subject: input.subject.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId || null } : {}),
        closedAt: closing && wasOpen ? new Date() : closing ? existing.closedAt : null,
      },
      include: caseInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'crm-cases',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
      ...meta,
    });

    return mapCase(updated);
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.crmCase.findUnique({
      where: { id },
      include: { _count: { select: { interactions: true } } },
    });
    if (!existing) throw notFound('Case not found');
    if (existing._count.interactions > 0) {
      throw conflict('Cannot delete a case that has interactions. Cancel it instead.');
    }

    await prisma.crmCase.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'crm-cases',
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
  requirePermission('crm.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await casesService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('crm.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await casesService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requireAnyPermission('crm.create', 'crm.manage_cases'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await casesService.create(req.body, req.user!.id, getClientMeta(req)), 201),
  ),
);
router.patch(
  '/:id',
  requireAnyPermission('crm.update', 'crm.manage_cases'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await casesService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);
router.delete(
  '/:id',
  requirePermission('crm.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await casesService.remove(req.params.id!, req.user!.id, getClientMeta(req))),
  ),
);

export default router;
