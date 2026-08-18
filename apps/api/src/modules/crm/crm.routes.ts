import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  CrmCaseStatus,
  CrmChannel,
  CrmInteractionStatus,
  CrmInteractionType,
  CrmPriority,
  CrmResolution,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { writeAuditLog } from '../../lib/audit';
import { getClientMeta } from '../../utils/helpers';
import {
  CHANNELS,
  CASE_STATUSES,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
  INTERACTION_STATUSES,
  INTERACTION_TYPES,
  PRIORITIES,
  RESOLUTIONS,
  endOfDay,
  followUpInclude,
  interactionInclude,
  mapFollowUp,
  mapInteraction,
  mapUserRef,
  nextCustomerCode,
  nextInteractionNumber,
  parseDuration,
  startOfDay,
  userRefSelect,
} from './helpers';
import customersRouter from './customers.routes';
import interactionsRouter from './interactions.routes';
import casesRouter from './cases.routes';
import followUpsRouter from './follow-ups.routes';

const importRecordSchema = z.object({
  legacyRecordId: z.union([z.string(), z.number()]).optional(),
  storeName: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
  inquiry: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  resolution: z.string().optional().nullable(),
  interactionType: z.string().optional().nullable(),
  duration: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  agentEmail: z.string().optional().nullable(),
  agentName: z.string().optional().nullable(),
  interactionDate: z.coerce.date().optional().nullable(),
});

const importSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  createMissingCustomers: z.boolean().optional().default(true),
  records: z.array(importRecordSchema).min(1).max(500),
});

const LEGACY_SOURCE = 'old_crm';

function mapEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback;
  const normalized = value.trim().toUpperCase().replace(/[\s-/]+/g, '_');
  const aliases: Record<string, string> = {
    PHONE: 'PHONE',
    CALL: 'PHONE',
    INBOUND_CALL: 'INBOUND_CALL',
    INBOUND: 'INBOUND_CALL',
    OUTBOUND_CALL: 'OUTBOUND_CALL',
    OUTBOUND: 'OUTBOUND_CALL',
    RESOLVED_ON_FIRST_CALL_CONTACT: 'RESOLVED_FIRST_CONTACT',
    RESOLVED_ON_FIRST_CALL: 'RESOLVED_FIRST_CONTACT',
    CUSTOMER_CALLBACK_REQUIRED: 'CALLBACK_REQUIRED',
    CALLBACK: 'CALLBACK_REQUIRED',
    COMPLETED: 'COMPLETED',
    OPEN: 'PENDING',
    LOW: 'LOW',
    NORMAL: 'NORMAL',
    MEDIUM: 'NORMAL',
    HIGH: 'HIGH',
    URGENT: 'URGENT',
  };
  const mapped = (aliases[normalized] ?? normalized) as T;
  return allowed.includes(mapped) ? mapped : fallback;
}

async function matchAgent(email?: string | null, name?: string | null) {
  if (email) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (user) return user.id;
  }
  if (name) {
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || undefined;
    const employee = await prisma.employee.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        ...(lastName ? { lastName: { equals: lastName, mode: 'insensitive' } } : {}),
        userId: { not: null },
      },
      select: { userId: true },
    });
    if (employee?.userId) return employee.userId;
  }
  return null;
}

async function matchOrCreateCustomer(record: z.infer<typeof importRecordSchema>, createMissing: boolean) {
  const phone = record.phone?.trim() || null;
  const email = record.email?.trim().toLowerCase() || null;
  const name = record.customerName?.trim() || record.storeName?.trim() || 'Unknown customer';
  const storeName = record.storeName?.trim() || null;

  if (record.legacyRecordId) {
    const byLegacy = await prisma.customer.findFirst({
      where: {
        legacySource: LEGACY_SOURCE,
        legacyRecordId: `customer:${record.legacyRecordId}`,
      },
    });
    if (byLegacy) return { customer: byLegacy, created: false };
  }

  if (phone) {
    const byPhone = await prisma.customer.findFirst({ where: { phone } });
    if (byPhone) return { customer: byPhone, created: false };
  }
  if (email) {
    const byEmail = await prisma.customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (byEmail) return { customer: byEmail, created: false };
  }

  if (!createMissing) return { customer: null, created: false };

  const customer = await prisma.customer.create({
    data: {
      code: await nextCustomerCode(),
      name,
      storeName,
      phone,
      email,
      legacySource: LEGACY_SOURCE,
      legacyRecordId: record.legacyRecordId ? `customer:${record.legacyRecordId}` : null,
    },
  });
  return { customer, created: true };
}

export const crmService = {
  async dashboard() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      todayInteractions,
      openCases,
      pendingFollowUps,
      resolvedToday,
      recentInteractions,
      upcomingFollowUps,
    ] = await Promise.all([
      prisma.crmInteraction.count({
        where: { interactionDate: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.crmCase.count({
        where: { status: { in: [CrmCaseStatus.OPEN, CrmCaseStatus.IN_PROGRESS] } },
      }),
      prisma.crmFollowUp.count({ where: { status: 'PENDING' } }),
      prisma.crmInteraction.count({
        where: {
          interactionDate: { gte: todayStart, lte: todayEnd },
          resolution: { in: ['RESOLVED_FIRST_CONTACT', 'RESOLVED'] },
        },
      }),
      prisma.crmInteraction.findMany({
        include: interactionInclude,
        orderBy: { interactionDate: 'desc' },
        take: 8,
      }),
      prisma.crmFollowUp.findMany({
        where: { status: 'PENDING' },
        include: followUpInclude,
        orderBy: { followUpDate: 'asc' },
        take: 8,
      }),
    ]);

    return {
      todayInteractions,
      openCases,
      pendingFollowUps,
      resolvedToday,
      recentInteractions: recentInteractions.map(mapInteraction),
      pendingFollowUpItems: upcomingFollowUps.map(mapFollowUp),
    };
  },

  async lookups() {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: userRefSelect,
      orderBy: { email: 'asc' },
      take: 200,
    });

    return {
      agents: users.map((u) => mapUserRef(u)),
      channels: CHANNELS,
      interactionTypes: INTERACTION_TYPES,
      resolutions: RESOLUTIONS,
      interactionStatuses: INTERACTION_STATUSES,
      priorities: PRIORITIES,
      caseStatuses: CASE_STATUSES,
      followUpStatuses: FOLLOW_UP_STATUSES,
      followUpTypes: FOLLOW_UP_TYPES,
    };
  },

  async importLegacy(
    input: z.infer<typeof importSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const report = {
      total: input.records.length,
      imported: 0,
      matchedCustomers: 0,
      createdCustomers: 0,
      unmatchedCustomers: 0,
      unmatchedAgents: 0,
      duplicates: 0,
      failed: 0,
      errors: [] as Array<{ index: number; message: string }>,
    };

    for (const [index, record] of input.records.entries()) {
      try {
        const legacyRecordId = record.legacyRecordId != null ? String(record.legacyRecordId) : null;
        if (legacyRecordId) {
          const existing = await prisma.crmInteraction.findFirst({
            where: { legacySource: LEGACY_SOURCE, legacyRecordId },
          });
          if (existing) {
            report.duplicates += 1;
            continue;
          }
        }

        const agentId = (await matchAgent(record.agentEmail, record.agentName)) ?? actorId;
        if (!(await matchAgent(record.agentEmail, record.agentName))) {
          report.unmatchedAgents += 1;
        }

        if (input.dryRun) {
          const phone = record.phone?.trim();
          const email = record.email?.trim();
          const matched =
            (phone && (await prisma.customer.findFirst({ where: { phone } }))) ||
            (email &&
              (await prisma.customer.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } },
              })));
          if (matched) report.matchedCustomers += 1;
          else if (input.createMissingCustomers) report.createdCustomers += 1;
          else report.unmatchedCustomers += 1;
          report.imported += 1;
          continue;
        }

        const { customer, created } = await matchOrCreateCustomer(
          record,
          input.createMissingCustomers,
        );
        if (!customer) {
          report.unmatchedCustomers += 1;
          report.failed += 1;
          report.errors.push({ index, message: 'Customer could not be matched' });
          continue;
        }
        if (created) report.createdCustomers += 1;
        else report.matchedCustomers += 1;

        await prisma.crmInteraction.create({
          data: {
            interactionNumber: await nextInteractionNumber(),
            customerId: customer.id,
            agentId,
            channel: mapEnum(record.channel, CHANNELS, 'PHONE') as CrmChannel,
            interactionType: mapEnum(
              record.interactionType,
              INTERACTION_TYPES,
              'INBOUND_CALL',
            ) as CrmInteractionType,
            interactionDate: record.interactionDate ?? new Date(),
            durationSeconds: parseDuration(record.duration),
            inquiry: record.inquiry?.trim() || 'Imported from legacy CRM',
            notes: record.notes?.trim() || null,
            resolution: record.resolution
              ? (mapEnum(record.resolution, RESOLUTIONS, 'OTHER') as CrmResolution)
              : null,
            status: mapEnum(record.status, INTERACTION_STATUSES, 'COMPLETED') as CrmInteractionStatus,
            priority: mapEnum(record.priority, PRIORITIES, 'NORMAL') as CrmPriority,
            legacySource: LEGACY_SOURCE,
            legacyRecordId,
          },
        });
        report.imported += 1;
      } catch (err) {
        report.failed += 1;
        report.errors.push({
          index,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (!input.dryRun) {
      await writeAuditLog({
        userId: actorId,
        action: 'CREATE',
        resource: 'crm-import',
        newValues: report,
        ...meta,
      });
    }

    return { dryRun: input.dryRun, ...report };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/dashboard',
  requirePermission('crm.view'),
  asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, await crmService.dashboard())),
);

router.get(
  '/lookups',
  requirePermission('crm.view'),
  asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, await crmService.lookups())),
);

router.post(
  '/import',
  requireAnyPermission('crm.create', 'crm.update'),
  validateRequest(importSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await crmService.importLegacy(req.body, req.user!.id, getClientMeta(req))),
  ),
);

router.use('/customers', customersRouter);
router.use('/interactions', interactionsRouter);
router.use('/cases', casesRouter);
router.use('/follow-ups', followUpsRouter);

export default router;
