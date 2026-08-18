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
import {
  customerSearchWhere,
  mapFollowUp,
  mapInteraction,
  mapUserRef,
  nextCustomerCode,
  followUpInclude,
  interactionInclude,
  userRefSelect,
} from './helpers';

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
  name: z.string().min(1).max(150),
  storeName: z.string().max(150).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

function normalizeEmail(email: string | null | undefined) {
  if (!email) return null;
  const trimmed = email.trim();
  return trimmed === '' ? null : trimmed.toLowerCase();
}

export const customersService = {
  async list(query: z.infer<typeof listSchema>) {
    const where = {
      AND: [
        query.search ? customerSearchWhere(query.search) : {},
        query.isActive === undefined ? {} : { isActive: query.isActive },
      ],
    };

    const [total, items] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: {
          _count: { select: { interactions: true, cases: true, followUps: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      items: items.map((c) => ({
        ...c,
        interactionCount: c._count.interactions,
        caseCount: c._count.cases,
        followUpCount: c._count.followUps,
        _count: undefined,
      })),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { interactions: true, cases: true, followUps: true } },
      },
    });
    if (!customer) throw notFound('Customer not found');

    const [interactions, cases, followUps] = await Promise.all([
      prisma.crmInteraction.findMany({
        where: { customerId: id },
        include: interactionInclude,
        orderBy: { interactionDate: 'desc' },
        take: 50,
      }),
      prisma.crmCase.findMany({
        where: { customerId: id },
        include: {
          assignedTo: { select: userRefSelect },
          _count: { select: { interactions: true, followUps: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.crmFollowUp.findMany({
        where: { customerId: id },
        include: followUpInclude,
        orderBy: { followUpDate: 'desc' },
        take: 20,
      }),
    ]);

    const activity = [
      ...interactions.map((item) => ({
        id: item.id,
        type: 'interaction' as const,
        date: item.interactionDate,
        title: item.interactionType.replace(/_/g, ' '),
        subtitle: item.inquiry,
        store: item.store,
        storeOther: item.storeOther,
        orderNumber: item.orderNumber,
        status: item.status,
        agent: mapUserRef(item.agent),
        hrefId: item.id,
      })),
      ...cases.map((item) => ({
        id: item.id,
        type: 'case' as const,
        date: item.createdAt,
        title: item.subject,
        subtitle: item.caseNumber,
        status: item.status,
        agent: mapUserRef(item.assignedTo),
        hrefId: item.id,
      })),
      ...followUps.map((item) => ({
        id: item.id,
        type: 'follow_up' as const,
        date: item.followUpDate,
        title: `Follow-up (${item.followUpType})`,
        subtitle: item.notes,
        status: item.status,
        agent: mapUserRef(item.assignedTo),
        hrefId: item.id,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      ...customer,
      interactionCount: customer._count.interactions,
      caseCount: customer._count.cases,
      followUpCount: customer._count.followUps,
      _count: undefined,
      interactions: interactions.map(mapInteraction),
      cases: cases.map((c) => ({
        ...c,
        assignedTo: mapUserRef(c.assignedTo),
        interactionCount: c._count.interactions,
        followUpCount: c._count.followUps,
        _count: undefined,
      })),
      followUps: followUps.map(mapFollowUp),
      activity,
    };
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const customer = await prisma.customer.create({
      data: {
        code: await nextCustomerCode(),
        name: input.name.trim(),
        storeName: input.storeName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: normalizeEmail(input.email),
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        isActive: input.isActive ?? true,
      },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'crm-customers',
      resourceId: customer.id,
      newValues: customer,
      ...meta,
    });

    return customer;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw notFound('Customer not found');

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.storeName !== undefined ? { storeName: input.storeName?.trim() || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'crm-customers',
      resourceId: id,
      oldValues: existing,
      newValues: customer,
      ...meta,
    });

    return customer;
  },

  async remove(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { interactions: true, cases: true, followUps: true } } },
    });
    if (!existing) throw notFound('Customer not found');
    if (
      existing._count.interactions > 0 ||
      existing._count.cases > 0 ||
      existing._count.followUps > 0
    ) {
      throw conflict('Cannot delete a customer that has CRM activity. Deactivate them instead.');
    }

    await prisma.customer.delete({ where: { id } });
    await writeAuditLog({
      userId: actorId,
      action: 'DELETE',
      resource: 'crm-customers',
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
    sendSuccess(res, await customersService.list(req.query as never)),
  ),
);
router.get(
  '/:id',
  requirePermission('crm.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.getById(req.params.id!)),
  ),
);
router.post(
  '/',
  requirePermission('crm.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.create(req.body, req.user!.id, getClientMeta(req)), 201),
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
      await customersService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
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
      await customersService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
