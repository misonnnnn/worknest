export type ITTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ITTicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export type HelpdeskUserRef = {
  id: string;
  email: string;
  displayName: string;
};

export type HelpdeskCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type HelpdeskTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  categoryId: string;
  requesterId: string;
  assigneeId: string | null;
  priority: ITTicketPriority;
  status: ITTicketStatus;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: HelpdeskCategory;
  requester: HelpdeskUserRef | null;
  assignee: HelpdeskUserRef | null;
  commentCount: number;
  attachmentCount?: number;
};

export type HelpdeskComment = {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  user: HelpdeskUserRef | null;
};

export type HelpdeskHistory = {
  id: string;
  ticketId: string;
  userId: string | null;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: HelpdeskUserRef | null;
};

export type HelpdeskAttachment = {
  id: string;
  ticketId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  createdAt: string;
  url: string;
  uploadedBy: HelpdeskUserRef | null;
};

export type HelpdeskTicketDetail = HelpdeskTicket & {
  comments: HelpdeskComment[];
  history: HelpdeskHistory[];
  attachments: HelpdeskAttachment[];
};

export type HelpdeskDashboard = {
  open: number;
  unassigned: number;
  inProgress: number;
  pending: number;
  resolved: number;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  recentTickets: HelpdeskTicket[];
};

export type HelpdeskLookups = {
  priorities: ITTicketPriority[];
  statuses: ITTicketStatus[];
  categories: HelpdeskCategory[];
  technicians: HelpdeskUserRef[];
};

export const PRIORITY_LABELS: Record<ITTicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const STATUS_LABELS: Record<ITTicketStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  'ticket.created': 'Ticket created',
  'ticket.resolved': 'Ticket resolved',
  'ticket.reopened': 'Ticket reopened',
  'status.changed': 'Status changed',
  'priority.changed': 'Priority changed',
  'assignee.changed': 'Assignee changed',
  'assignee.cleared': 'Assignee cleared',
  'title.updated': 'Title updated',
  'category.updated': 'Category updated',
  'comment.added': 'Comment added',
  'comment.internal': 'Internal note added',
  'attachment.added': 'Attachment added',
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function previewText(value: string | null | undefined, max = 80) {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export const filterSelectClassName =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export const textareaClassName =
  'flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
