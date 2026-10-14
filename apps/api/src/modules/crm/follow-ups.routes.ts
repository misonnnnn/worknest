import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import {
  customerSearchWhere,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
  followUpInclude,
  mapFollowUp,
} from './helpers';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  customerId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const followUpBodySchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200).optional().nullable(),
  customerPhone: z.string().max(50).optional().nullable(),
  interactionId: z.string().uuid().optional().nullable(),
  caseId: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional(),
  followUpDate: z.coerce.date(),
  followUpType: z.enum(FOLLOW_UP_TYPES).optional().default('CALL'),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(FOLLOW_UP_STATUSES).optional().default('PENDING'),
});

const createSchema = followUpBodySchema.superRefine((value, ctx) => {
  if (!value.customerId && !value.customerName?.trim() && !value.interactionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Customer name is required',
      path: ['customerName'],
    });
  }
});

const updateSchema = followUpBodySchema
  .partial()
  .omit({ customerId: true, customerName: true, customerPhone: true });

export const followUpsService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search
          ? {
              OR: [
                { notes: { contains: query.search, mode: 'insensitive' as const } },
                { customerName: { contains: query.search, mode: 'insensitive' as const } },
                { customerPhone: { contains: query.search, mode: 'insensitive' as const } },
                { customer: customerSearchWhere(query.search) },
              ],
            }
          : {},
        query.customerId ? { customerId: query.customerId } : {},
        query.assignedToId ? { assignedToId: query.assignedToId } : {},
        query.status ? { status: query.status } : {},
        query.dateFrom || query.dateTo
          ? {
              followUpDate: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
              },
            }
          : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.crmFollowUp.count({ where }),
      prisma.crmFollowUp.findMany({
        where,
        include: followUpInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ status: 'asc' }, { followUpDate: 'asc' }],
      }),
    ]);

    return {
      items: items.map(mapFollowUp),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const item = await prisma.crmFollowUp.findUnique({
      where: { id },
      include: followUpInclude,
    });
    if (!item) throw notFound('Follow-up not found');
    return mapFollowUp(item);
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const customerId = input.customerId || null;
    let customerName = input.customerName?.trim() || null;
    let customerPhone = input.customerPhone?.trim() || null;

    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw notFound('Customer not found');
      customerName = customerName || customer.name;
      customerPhone = customerPhone || customer.phone;
    }

    const assignedToId = input.assignedToId ?? actorId;
    const user = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!user) throw notFound('Assigned user not found');

    if (input.interactionId) {
      const interaction = await prisma.crmInteraction.findUnique({
        where: { id: input.interactionId },
      });
      if (!interaction) throw notFound('Interaction not found');
      if (!customerId && !customerName) {
        customerName = interaction.customerName;
        customerPhone = customerPhone || interaction.customerPhone;
      }
    }
    if (input.caseId) {
      const crmCase = await prisma.crmCase.findUnique({ where: { id: input.caseId } });
      if (!crmCase) throw notFound('Case not found');
    }

    if (!customerName) throw badRequest('Customer name is required');

    const created = await prisma.crmFollowUp.create({
      data: {
        customerId,
        customerName,
        customerPhone,
        interactionId: input.interactionId || null,
        caseId: input.caseId || null,
        assignedToId,
        followUpDate: input.followUpDate,
        followUpType: input.followUpType ?? 'CALL',
        notes: input.notes?.trim() || null,
        status: input.status ?? 'PENDING',
      },
      include: followUpInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'crm-follow-ups',
      resourceId: created.id,
      newValues: created,
      ...meta,
    });

    return mapFollowUp(created);
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.crmFollowUp.findUnique({ where: { id } });
    if (!existing) throw notFound('Follow-up not found');
    if (input.assignedToId) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedToId } });
      if (!user) throw notFound('Assigned user not found');
    }

    const updated = await prisma.crmFollowUp.update({
      where: { id },
      data: {
        ...(input.interactionId !== undefined ? { interactionId: input.interactionId || null } : {}),
        ...(input.caseId !== undefined ? { caseId: input.caseId || null } : {}),
        ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
        ...(input.followUpDate ? { followUpDate: input.followUpDate } : {}),
        ...(input.followUpType ? { followUpType: input.followUpType } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: followUpInclude,
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'crm-follow-ups',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
      ...meta,
    });

    return mapFollowUp(updated);
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.crmFollowUp.findUnique({ where: { id } });
    if (!existing) throw notFound('Follow-up not found');

    await prisma.crmFollowUp.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'crm-follow-ups',
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
    sendSuccess(res, await followUpsService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('crm.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await followUpsService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requireAnyPermission('crm.create', 'crm.manage_followups'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await followUpsService.create(req.body, req.user!.id, getClientMeta(req)), 201),
  ),
);
router.patch(
  '/:id',
  requireAnyPermission('crm.update', 'crm.manage_followups'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await followUpsService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
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
      await followUpsService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
