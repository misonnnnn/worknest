import { z } from 'zod';
import multer from 'multer';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AuthUser } from '@worknest/types';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { buildPagination, getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import {
  ALLOWED_IMAGE_TYPES,
  deleteStoredFile,
  saveUploadedFile,
} from '../media/media.storage';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  assertCanAccessTicket,
  assertCanCommentOnTicket,
  assertStatusTransition,
  canViewAllTickets,
  canViewInternalNotes,
  isReopenTarget,
  mapAttachment,
  mapTicket,
  mapUserRef,
  nextTicketNumber,
  recordHistory,
  ticketInclude,
  ticketScopeWhere,
  userRefSelect,
  type TicketStatus,
} from './helpers';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  categoryId: z.string().uuid().optional(),
  requesterId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  scope: z.enum(['all', 'mine', 'assigned']).optional().default('all'),
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
  categoryId: z.string().uuid(),
  priority: z.enum(TICKET_PRIORITIES).optional().default('MEDIUM'),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(10000).optional(),
  categoryId: z.string().uuid().optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

const assignSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});

const statusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});

const prioritySchema = z.object({
  priority: z.enum(TICKET_PRIORITIES),
});

const resolveSchema = z.object({
  resolutionSummary: z.string().min(1).max(5000),
});

const commentSchema = z.object({
  message: z.string().min(1).max(5000),
  isInternal: z.boolean().optional().default(false),
});

type ClientMeta = { ipAddress?: string | null; userAgent?: string | null };

function hasPerm(user: AuthUser, key: string) {
  return user.permissions.includes(key);
}

function buildListWhere(user: AuthUser, query: z.infer<typeof listSchema>) {
  const scopeFilter =
    query.scope === 'mine'
      ? { requesterId: user.id }
      : query.scope === 'assigned'
        ? { assigneeId: user.id }
        : ticketScopeWhere(user);

  if (query.scope === 'all' && query.requesterId && !canViewAllTickets(user)) {
    throw forbidden('Cannot filter by requester without helpdesk.view_all');
  }
  if (query.scope === 'all' && query.assigneeId && !canViewAllTickets(user) && query.assigneeId !== user.id) {
    throw forbidden('Cannot filter by assignee without helpdesk.view_all');
  }

  return {
    AND: [
      scopeFilter,
      query.search
        ? {
            OR: [
              { ticketNumber: { contains: query.search } },
              { title: { contains: query.search } },
            ],
          }
        : {},
      query.status ? { status: query.status } : {},
      query.priority ? { priority: query.priority } : {},
      query.categoryId ? { categoryId: query.categoryId } : {},
      query.requesterId && canViewAllTickets(user) ? { requesterId: query.requesterId } : {},
      query.assigneeId ? { assigneeId: query.assigneeId } : {},
    ],
  };
}

export const ticketsService = {
  async list(user: AuthUser, query: z.infer<typeof listSchema>) {
    const where = buildListWhere(user, query);
    const [total, items] = await Promise.all([
      prisma.iTTicket.count({ where }),
      prisma.iTTicket.findMany({
        where,
        include: ticketInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map(mapTicket),
      ...buildPagination(query.page, query.pageSize, total),
    };
  },

  async getById(user: AuthUser, id: string) {
    const ticket = await prisma.iTTicket.findUnique({
      where: { id },
      include: {
        ...ticketInclude,
        comments: {
          include: { user: { select: userRefSelect } },
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: { user: { select: userRefSelect } },
          orderBy: { createdAt: 'desc' },
        },
        attachments: {
          include: { uploadedBy: { select: userRefSelect } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw notFound('Ticket not found');
    assertCanAccessTicket(user, ticket);

    const showInternal = canViewInternalNotes(user);
    const { comments, history, attachments, ...rest } = ticket;

    return {
      ...mapTicket(rest),
      comments: comments
        .filter((c) => showInternal || !c.isInternal)
        .map((c) => ({
          id: c.id,
          ticketId: c.ticketId,
          userId: c.userId,
          message: c.message,
          isInternal: c.isInternal,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          user: mapUserRef(c.user),
        })),
      history: history.map((h) => ({
        id: h.id,
        ticketId: h.ticketId,
        userId: h.userId,
        action: h.action,
        oldValue: h.oldValue,
        newValue: h.newValue,
        createdAt: h.createdAt,
        user: mapUserRef(h.user),
      })),
      attachments: await Promise.all(attachments.map((a) => mapAttachment(a))),
    };
  },

  async create(input: z.infer<typeof createSchema>, actor: AuthUser, meta: ClientMeta) {
    const category = await prisma.iTTicketCategory.findUnique({ where: { id: input.categoryId } });
    if (!category || !category.isActive) throw badRequest('Invalid or inactive category');

    const created = await prisma.$transaction(async (tx) => {
      const ticketNumber = await nextTicketNumber(tx);
      const ticket = await tx.iTTicket.create({
        data: {
          ticketNumber,
          title: input.title.trim(),
          description: input.description.trim(),
          categoryId: input.categoryId,
          requesterId: actor.id,
          priority: input.priority ?? 'MEDIUM',
          status: 'OPEN',
        },
        include: ticketInclude,
      });

      await recordHistory(tx, {
        ticketId: ticket.id,
        userId: actor.id,
        action: 'ticket.created',
        newValue: ticket.ticketNumber,
      });

      return ticket;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'CREATE',
      resource: 'helpdesk-tickets',
      resourceId: created.id,
      newValues: { ticketNumber: created.ticketNumber, title: created.title },
      ...meta,
    });

    return mapTicket(created);
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actor: AuthUser,
    meta: ClientMeta,
  ) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    assertCanAccessTicket(actor, existing);

    const isStaff = hasPerm(actor, 'helpdesk.update');
    const isOwn = existing.requesterId === actor.id;
    if (!isStaff && !(isOwn && existing.status === 'OPEN')) {
      throw forbidden('You cannot update this ticket');
    }
    if (!isStaff && input.priority !== undefined) {
      throw forbidden('You cannot change ticket priority');
    }

    if (input.categoryId) {
      const category = await prisma.iTTicketCategory.findUnique({ where: { id: input.categoryId } });
      if (!category || !category.isActive) throw badRequest('Invalid or inactive category');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.iTTicket.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.priority && isStaff ? { priority: input.priority } : {}),
        },
        include: ticketInclude,
      });

      if (input.title !== undefined && input.title.trim() !== existing.title) {
        await recordHistory(tx, {
          ticketId: id,
          userId: actor.id,
          action: 'title.updated',
          oldValue: existing.title,
          newValue: input.title.trim(),
        });
      }
      if (input.categoryId && input.categoryId !== existing.categoryId) {
        await recordHistory(tx, {
          ticketId: id,
          userId: actor.id,
          action: 'category.updated',
          oldValue: existing.categoryId,
          newValue: input.categoryId,
        });
      }
      if (input.priority && isStaff && input.priority !== existing.priority) {
        await recordHistory(tx, {
          ticketId: id,
          userId: actor.id,
          action: 'priority.changed',
          oldValue: existing.priority,
          newValue: input.priority,
        });
      }

      return ticket;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'helpdesk-tickets',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
      ...meta,
    });

    return mapTicket(updated);
  },

  async assign(id: string, input: z.infer<typeof assignSchema>, actor: AuthUser, meta: ClientMeta) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    if (!canViewAllTickets(actor)) assertCanAccessTicket(actor, existing);

    if (input.assigneeId) {
      const user = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!user || !user.isActive) throw badRequest('Invalid assignee');
    }

    const nextStatus: TicketStatus =
      input.assigneeId && existing.status === 'OPEN' ? 'ASSIGNED' : (existing.status as TicketStatus);

    if (nextStatus !== existing.status) {
      assertStatusTransition(existing.status as TicketStatus, nextStatus);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.iTTicket.update({
        where: { id },
        data: {
          assigneeId: input.assigneeId,
          status: nextStatus,
        },
        include: ticketInclude,
      });

      await recordHistory(tx, {
        ticketId: id,
        userId: actor.id,
        action: input.assigneeId ? 'assignee.changed' : 'assignee.cleared',
        oldValue: existing.assigneeId,
        newValue: input.assigneeId,
      });

      if (nextStatus !== existing.status) {
        await recordHistory(tx, {
          ticketId: id,
          userId: actor.id,
          action: 'status.changed',
          oldValue: existing.status,
          newValue: nextStatus,
        });
      }

      return ticket;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'helpdesk-tickets',
      resourceId: id,
      oldValues: { assigneeId: existing.assigneeId, status: existing.status },
      newValues: { assigneeId: updated.assigneeId, status: updated.status },
      ...meta,
    });

    return mapTicket(updated);
  },

  async changePriority(
    id: string,
    input: z.infer<typeof prioritySchema>,
    actor: AuthUser,
    meta: ClientMeta,
  ) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    assertCanAccessTicket(actor, existing);

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.iTTicket.update({
        where: { id },
        data: { priority: input.priority },
        include: ticketInclude,
      });

      if (input.priority !== existing.priority) {
        await recordHistory(tx, {
          ticketId: id,
          userId: actor.id,
          action: 'priority.changed',
          oldValue: existing.priority,
          newValue: input.priority,
        });
      }

      return ticket;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'helpdesk-tickets',
      resourceId: id,
      oldValues: { priority: existing.priority },
      newValues: { priority: updated.priority },
      ...meta,
    });

    return mapTicket(updated);
  },

  async changeStatus(
    id: string,
    input: z.infer<typeof statusSchema>,
    actor: AuthUser,
    meta: ClientMeta,
  ) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    assertCanAccessTicket(actor, existing);

    const from = existing.status as TicketStatus;
    const to = input.status;

    if (from === to) return mapTicket(await prisma.iTTicket.findUniqueOrThrow({
      where: { id },
      include: ticketInclude,
    }));

    assertStatusTransition(from, to);

    const isReopen = (from === 'RESOLVED' || from === 'CLOSED' || from === 'CANCELLED') && isReopenTarget(to);
    const isResolve = to === 'RESOLVED';
    const isClose = to === 'CLOSED';
    const isCancel = to === 'CANCELLED';

    if (isReopen && !hasPerm(actor, 'helpdesk.reopen')) {
      throw forbidden('Missing required permission: helpdesk.reopen');
    }
    if (isResolve && !hasPerm(actor, 'helpdesk.resolve')) {
      throw forbidden('Missing required permission: helpdesk.resolve');
    }
    if (isClose && !hasPerm(actor, 'helpdesk.close')) {
      throw forbidden('Missing required permission: helpdesk.close');
    }
    if (isCancel && !hasPerm(actor, 'helpdesk.update') && existing.requesterId !== actor.id) {
      throw forbidden('You cannot cancel this ticket');
    }
    if (isClose && from !== 'RESOLVED') {
      throw badRequest('Only resolved tickets can be closed');
    }
    if (!isReopen && !isResolve && !isClose && !isCancel && !hasPerm(actor, 'helpdesk.update')) {
      throw forbidden('Missing required permission: helpdesk.update');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.iTTicket.update({
        where: { id },
        data: {
          status: to,
          ...(isResolve
            ? { resolvedAt: new Date() }
            : isReopen
              ? { resolvedAt: null, closedAt: null, resolutionSummary: null }
              : {}),
          ...(isClose ? { closedAt: new Date() } : {}),
          ...(isCancel ? { closedAt: new Date() } : {}),
        },
        include: ticketInclude,
      });

      await recordHistory(tx, {
        ticketId: id,
        userId: actor.id,
        action: isReopen ? 'ticket.reopened' : 'status.changed',
        oldValue: from,
        newValue: to,
      });

      return ticket;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'helpdesk-tickets',
      resourceId: id,
      oldValues: { status: from },
      newValues: { status: to },
      ...meta,
    });

    return mapTicket(updated);
  },

  async resolve(id: string, input: z.infer<typeof resolveSchema>, actor: AuthUser, meta: ClientMeta) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    assertCanAccessTicket(actor, existing);
    assertStatusTransition(existing.status as TicketStatus, 'RESOLVED');

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.iTTicket.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolutionSummary: input.resolutionSummary.trim(),
          resolvedAt: new Date(),
        },
        include: ticketInclude,
      });

      await recordHistory(tx, {
        ticketId: id,
        userId: actor.id,
        action: 'ticket.resolved',
        oldValue: existing.status,
        newValue: 'RESOLVED',
      });

      return ticket;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'UPDATE',
      resource: 'helpdesk-tickets',
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: 'RESOLVED', resolutionSummary: input.resolutionSummary },
      ...meta,
    });

    return mapTicket(updated);
  },

  async close(id: string, actor: AuthUser, meta: ClientMeta) {
    return this.changeStatus(id, { status: 'CLOSED' }, actor, meta);
  },

  async reopen(id: string, actor: AuthUser, meta: ClientMeta) {
    return this.changeStatus(id, { status: 'OPEN' }, actor, meta);
  },

  async cancel(id: string, actor: AuthUser, meta: ClientMeta) {
    return this.changeStatus(id, { status: 'CANCELLED' }, actor, meta);
  },

  async addAttachments(
    id: string,
    files: Express.Multer.File[],
    actor: AuthUser,
    meta: ClientMeta,
  ) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    assertCanAccessTicket(actor, existing);

    const isOwn = existing.requesterId === actor.id;
    if (!hasPerm(actor, 'helpdesk.create') && !hasPerm(actor, 'helpdesk.update') && !isOwn) {
      throw forbidden('You cannot attach files to this ticket');
    }

    if (!files.length) throw badRequest('At least one image file is required');
    if (files.length > 5) throw badRequest('You can upload at most 5 images at a time');

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        throw badRequest('Only jpeg, png, webp, or gif images are allowed');
      }
    }

    const existingCount = await prisma.iTTicketAttachment.count({ where: { ticketId: id } });
    if (existingCount + files.length > 10) {
      throw badRequest('A ticket can have at most 10 image attachments');
    }

    const uploaded: Array<{
      storageKey: string;
      originalName: string;
      mimeType: string;
      size: number;
    }> = [];

    try {
      for (const file of files) {
        const stored = await saveUploadedFile(file.originalname, file.buffer, file.mimetype);
        uploaded.push({
          storageKey: stored.storageKey,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const rows = [];
        for (const file of uploaded) {
          rows.push(
            await tx.iTTicketAttachment.create({
              data: {
                ticketId: id,
                storageKey: file.storageKey,
                originalName: file.originalName,
                mimeType: file.mimeType,
                size: file.size,
                uploadedById: actor.id,
              },
              include: { uploadedBy: { select: userRefSelect } },
            }),
          );
        }
        await recordHistory(tx, {
          ticketId: id,
          userId: actor.id,
          action: 'attachment.added',
          newValue: `${rows.length} image(s)`,
        });
        return rows;
      });

      await writeAuditLog({
        userId: actor.id,
        action: 'CREATE',
        resource: 'helpdesk-attachments',
        resourceId: id,
        newValues: { count: created.length },
        ...meta,
      });

      return Promise.all(created.map((row) => mapAttachment(row)));
    } catch (err) {
      for (const file of uploaded) {
        try {
          await deleteStoredFile(file.storageKey);
        } catch (cleanupErr) {
          console.error('Failed to roll back ticket attachment:', cleanupErr);
        }
      }
      throw err;
    }
  },

  async addComment(
    id: string,
    input: z.infer<typeof commentSchema>,
    actor: AuthUser,
    meta: ClientMeta,
  ) {
    const existing = await prisma.iTTicket.findUnique({ where: { id } });
    if (!existing) throw notFound('Ticket not found');
    assertCanAccessTicket(actor, existing);
    // Viewers with module access may read comments; only requester or IT may post.
    assertCanCommentOnTicket(actor, existing);

    if (input.isInternal && !canViewInternalNotes(actor)) {
      throw forbidden('You cannot add internal notes');
    }

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.iTTicketComment.create({
        data: {
          ticketId: id,
          userId: actor.id,
          message: input.message.trim(),
          isInternal: input.isInternal ?? false,
        },
        include: { user: { select: userRefSelect } },
      });

      await recordHistory(tx, {
        ticketId: id,
        userId: actor.id,
        action: input.isInternal ? 'comment.internal' : 'comment.added',
        newValue: input.message.trim().slice(0, 120),
      });

      return created;
    });

    await writeAuditLog({
      userId: actor.id,
      action: 'CREATE',
      resource: 'helpdesk-comments',
      resourceId: comment.id,
      newValues: { ticketId: id, isInternal: comment.isInternal },
      ...meta,
    });

    return {
      id: comment.id,
      ticketId: comment.ticketId,
      userId: comment.userId,
      message: comment.message,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: mapUserRef(comment.user),
    };
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('helpdesk.view'),
  validateRequest(listSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await ticketsService.list(req.user!, req.query as never)),
  ),
);

router.get(
  '/:id',
  requirePermission('helpdesk.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await ticketsService.getById(req.user!, req.params.id!)),
  ),
);

router.post(
  '/',
  requirePermission('helpdesk.create'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await ticketsService.create(req.body, req.user!, getClientMeta(req)), 201),
  ),
);

router.patch(
  '/:id',
  requireAnyPermission('helpdesk.update', 'helpdesk.create'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await ticketsService.update(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

router.post(
  '/:id/assign',
  requirePermission('helpdesk.assign'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(assignSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await ticketsService.assign(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

router.post(
  '/:id/priority',
  requirePermission('helpdesk.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(prioritySchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await ticketsService.changePriority(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

router.post(
  '/:id/status',
  requireAnyPermission(
    'helpdesk.update',
    'helpdesk.resolve',
    'helpdesk.close',
    'helpdesk.reopen',
  ),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(statusSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await ticketsService.changeStatus(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

router.post(
  '/:id/resolve',
  requirePermission('helpdesk.resolve'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(resolveSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await ticketsService.resolve(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

router.post(
  '/:id/close',
  requirePermission('helpdesk.close'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await ticketsService.close(req.params.id!, req.user!, getClientMeta(req))),
  ),
);

router.post(
  '/:id/reopen',
  requirePermission('helpdesk.reopen'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await ticketsService.reopen(req.params.id!, req.user!, getClientMeta(req))),
  ),
);

router.post(
  '/:id/cancel',
  requireAnyPermission('helpdesk.update', 'helpdesk.create'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await ticketsService.cancel(req.params.id!, req.user!, getClientMeta(req))),
  ),
);

router.post(
  '/:id/comments',
  requirePermission('helpdesk.view'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(commentSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await ticketsService.addComment(req.params.id!, req.body, req.user!, getClientMeta(req)),
      201,
    ),
  ),
);

router.post(
  '/:id/attachments',
  requireAnyPermission('helpdesk.create', 'helpdesk.update'),
  validateRequest(uuidParamSchema, 'params'),
  attachmentUpload.array('files', 5),
  asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    return sendSuccess(
      res,
      await ticketsService.addAttachments(req.params.id!, files, req.user!, getClientMeta(req)),
      201,
    );
  }),
);

export default router;
