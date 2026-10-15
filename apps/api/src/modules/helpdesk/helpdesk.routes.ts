import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AuthUser } from '@worknest/types';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  canViewAllTickets,
  mapTicket,
  mapUserRef,
  ticketInclude,
  ticketScopeWhere,
  userRefSelect,
} from './helpers';
import ticketsRouter from './tickets.routes';
import categoriesRouter from './categories.routes';

async function getDashboard(user: AuthUser) {
  const scope = ticketScopeWhere(user);

  const [
    open,
    unassigned,
    inProgress,
    pending,
    resolved,
    byPriority,
    byStatus,
    recent,
  ] = await Promise.all([
    prisma.iTTicket.count({
      where: { AND: [scope, { status: { in: ['OPEN', 'ASSIGNED'] } }] },
    }),
    canViewAllTickets(user)
      ? prisma.iTTicket.count({
          where: {
            assigneeId: null,
            status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING'] },
          },
        })
      : prisma.iTTicket.count({
          where: {
            AND: [
              scope,
              { assigneeId: null },
              { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING'] } },
            ],
          },
        }),
    prisma.iTTicket.count({
      where: { AND: [scope, { status: 'IN_PROGRESS' }] },
    }),
    prisma.iTTicket.count({
      where: { AND: [scope, { status: 'PENDING' }] },
    }),
    prisma.iTTicket.count({
      where: { AND: [scope, { status: 'RESOLVED' }] },
    }),
    prisma.iTTicket.groupBy({
      by: ['priority'],
      where: scope,
      _count: { _all: true },
    }),
    prisma.iTTicket.groupBy({
      by: ['status'],
      where: scope,
      _count: { _all: true },
    }),
    prisma.iTTicket.findMany({
      where: scope,
      include: ticketInclude,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const priorityCounts = Object.fromEntries(
    TICKET_PRIORITIES.map((p) => [p, 0]),
  ) as Record<string, number>;
  for (const row of byPriority) {
    priorityCounts[row.priority] = row._count._all;
  }

  const statusCounts = Object.fromEntries(
    TICKET_STATUSES.map((s) => [s, 0]),
  ) as Record<string, number>;
  for (const row of byStatus) {
    statusCounts[row.status] = row._count._all;
  }

  return {
    open,
    unassigned,
    inProgress,
    pending,
    resolved,
    byPriority: priorityCounts,
    byStatus: statusCounts,
    recentTickets: recent.map(mapTicket),
  };
}

async function getLookups(user: AuthUser) {
  const [categories, technicians] = await Promise.all([
    prisma.iTTicketCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    }),
    canViewAllTickets(user) ||
    user.permissions.includes('helpdesk.assign') ||
    user.permissions.includes('helpdesk.update')
      ? prisma.user.findMany({
          where: {
            isActive: true,
            roles: {
              some: {
                role: {
                  permissions: {
                    some: {
                      permission: {
                        key: {
                          in: [
                            'helpdesk.assign',
                            'helpdesk.resolve',
                            'helpdesk.update',
                            'helpdesk.view_all',
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          select: userRefSelect,
          orderBy: { email: 'asc' },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  return {
    priorities: [...TICKET_PRIORITIES],
    statuses: [...TICKET_STATUSES],
    categories,
    technicians: technicians.map(mapUserRef),
  };
}

const router = Router();
router.use(requireAuth);

router.get(
  '/dashboard',
  requirePermission('helpdesk.view'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await getDashboard(req.user!)),
  ),
);

router.get(
  '/lookups',
  requirePermission('helpdesk.view'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await getLookups(req.user!)),
  ),
);

router.use('/tickets', ticketsRouter);
router.use('/categories', categoriesRouter);

export default router;
