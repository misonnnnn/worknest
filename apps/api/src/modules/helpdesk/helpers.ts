import type { AuthUser } from '@worknest/types';
import type { ITTicketPriority, ITTicketStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { forbidden } from '../../lib/errors';
import { getFileAccessUrl } from '../media/media.storage';

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const TICKET_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Allowed status transitions (from → to[]). */
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CANCELLED'],
  ASSIGNED: ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'ASSIGNED', 'PENDING', 'RESOLVED', 'CANCELLED'],
  PENDING: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN', 'IN_PROGRESS'],
  CLOSED: ['OPEN', 'IN_PROGRESS'],
  CANCELLED: ['OPEN'],
};

export const userRefSelect = {
  id: true,
  email: true,
  employee: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
} as const;

type UserRefRecord = {
  id: string;
  email: string;
  employee: { firstName: string; lastName: string } | null;
};

export function mapUserRef(user: UserRefRecord | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.employee
      ? `${user.employee.firstName} ${user.employee.lastName}`
      : user.email,
  };
}

export const categorySelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
} as const;

export const ticketInclude = {
  category: { select: categorySelect },
  requester: { select: userRefSelect },
  assignee: { select: userRefSelect },
  _count: { select: { comments: true, attachments: true } },
} as const;

export type TicketIncludeRecord = Prisma.ITTicketGetPayload<{ include: typeof ticketInclude }>;

export function mapTicket(row: TicketIncludeRecord) {
  const { requester, assignee, category, _count, ...rest } = row;
  return {
    ...rest,
    category,
    requester: mapUserRef(requester),
    assignee: mapUserRef(assignee),
    commentCount: _count.comments,
    attachmentCount: _count.attachments,
  };
}

export async function mapAttachment(row: {
  id: string;
  ticketId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  createdAt: Date;
  uploadedBy?: {
    id: string;
    email: string;
    employee: { firstName: string; lastName: string } | null;
  } | null;
}) {
  const { storageKey, uploadedBy, ...rest } = row;
  return {
    ...rest,
    url: await getFileAccessUrl(storageKey),
    uploadedBy: mapUserRef(uploadedBy),
  };
}

/** Roles that are explicitly IT helpdesk staff (not CSR / regular employees). */
export const HELPDESK_IT_ROLE_NAMES = ['IT Manager', 'IT Technician', 'Super Admin'] as const;

/**
 * IT Manager / Technician / Super Admin — not CSR or Employee,
 * even if those roles were accidentally granted some helpdesk.* keys.
 */
export function isHelpdeskITStaff(user: AuthUser) {
  if (user.roles.some((role) => (HELPDESK_IT_ROLE_NAMES as readonly string[]).includes(role.name))) {
    return true;
  }
  // Custom IT roles: assign/manage_categories only.
  // Do not treat update/resolve/view_all alone as IT — CSR was wrongly granted those.
  return (
    user.permissions.includes('helpdesk.assign') ||
    user.permissions.includes('helpdesk.manage_categories')
  );
}

export function canViewInternalNotes(user: AuthUser) {
  return isHelpdeskITStaff(user);
}

export function canViewAllTickets(user: AuthUser) {
  return user.permissions.includes('helpdesk.view_all');
}

/** Only the ticket submitter or IT staff may post comments. */
export function canCommentOnTicket(
  user: AuthUser,
  ticket: { requesterId: string },
) {
  return ticket.requesterId === user.id || isHelpdeskITStaff(user);
}

export function assertCanCommentOnTicket(
  user: AuthUser,
  ticket: { requesterId: string },
) {
  if (canCommentOnTicket(user, ticket)) return;
  throw forbidden('Only the ticket requester or IT staff can comment on this ticket');
}

export function assertCanAccessTicket(
  user: AuthUser,
  ticket: { requesterId: string; assigneeId: string | null },
) {
  if (canViewAllTickets(user)) return;
  if (ticket.requesterId === user.id) return;
  if (ticket.assigneeId === user.id) return;
  throw forbidden('You do not have access to this ticket');
}

export function ticketScopeWhere(user: AuthUser): Prisma.ITTicketWhereInput {
  if (canViewAllTickets(user)) return {};
  return {
    OR: [{ requesterId: user.id }, { assigneeId: user.id }],
  };
}

export function assertStatusTransition(from: TicketStatus, to: TicketStatus) {
  const allowed = STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw forbidden(`Cannot change status from ${from} to ${to}`);
  }
}

export async function nextTicketNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();

  await tx.iTTicketNumberSequence.upsert({
    where: { year },
    create: { year, nextNumber: 1 },
    update: {},
  });

  const updated = await tx.iTTicketNumberSequence.update({
    where: { year },
    data: { nextNumber: { increment: 1 } },
  });

  const sequence = updated.nextNumber - 1;
  return `IT-${year}-${String(sequence).padStart(5, '0')}`;
}

export async function recordHistory(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    userId: string;
    action: string;
    oldValue?: string | null;
    newValue?: string | null;
  },
) {
  await tx.iTTicketHistory.create({
    data: {
      ticketId: input.ticketId,
      userId: input.userId,
      action: input.action,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
    },
  });
}

export function isTerminalStatus(status: ITTicketStatus) {
  return status === 'RESOLVED' || status === 'CLOSED' || status === 'CANCELLED';
}

export function isReopenTarget(status: ITTicketStatus) {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

export type { ITTicketPriority, ITTicketStatus };

/** Soft-ensure default categories exist (used by seed and optional boot). */
export async function ensureDefaultCategories(
  client: { iTTicketCategory: typeof prisma.iTTicketCategory } = prisma,
) {
  const defaults = [
    { name: 'Hardware', description: 'Laptops, desktops, peripherals, and hardware faults' },
    { name: 'Software', description: 'Application install, crashes, and license issues' },
    { name: 'Network', description: 'Connectivity, VPN, Wi-Fi, and network access' },
    { name: 'Account and Access', description: 'Passwords, MFA, and system access requests' },
    { name: 'Email', description: 'Mailbox, Outlook, and email delivery issues' },
    { name: 'Printer', description: 'Printers, scanners, and print queues' },
    { name: 'Other', description: 'Anything that does not fit other categories' },
  ];

  for (const category of defaults) {
    await client.iTTicketCategory.upsert({
      where: { name: category.name },
      update: { description: category.description, isActive: true },
      create: category,
    });
  }
}
