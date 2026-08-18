import { getAccessToken } from '@/lib/api';

export type CrmChannel = 'PHONE' | 'EMAIL' | 'CHAT' | 'WALK_IN' | 'OTHER';
export type CrmInteractionType =
  | 'INBOUND_CALL'
  | 'OUTBOUND_CALL'
  | 'EMAIL'
  | 'CHAT'
  | 'OTHER';
export type CrmResolution =
  | 'RESOLVED_FIRST_CONTACT'
  | 'RESOLVED'
  | 'CALLBACK_REQUIRED'
  | 'PENDING'
  | 'ESCALATED'
  | 'NO_RESOLUTION'
  | 'OTHER';
export type CrmInteractionStatus = 'COMPLETED' | 'PENDING' | 'IN_PROGRESS' | 'CANCELLED';
export type CrmPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type CrmCaseStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
export type CrmFollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
export type CrmFollowUpType = 'CALL' | 'EMAIL' | 'VISIT' | 'OTHER';

export type CrmUserRef = {
  id: string;
  email: string;
  displayName: string;
};

export type CrmCustomerRef = {
  id: string;
  code: string;
  name: string;
  storeName: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
};

export type CrmCustomerRow = CrmCustomerRef & {
  notes: string | null;
  isActive: boolean;
  interactionCount: number;
  caseCount: number;
  followUpCount: number;
};

export type CrmActivityItem = {
  id: string;
  type: 'interaction' | 'case' | 'follow_up';
  date: string;
  title: string;
  subtitle: string | null;
  status: string;
  agent: CrmUserRef | null;
  hrefId: string;
};

export type CrmCustomerDetail = CrmCustomerRow & {
  address: string | null;
  interactions: CrmInteractionRow[];
  cases: CrmCaseRow[];
  followUps: CrmFollowUpRow[];
  activity: CrmActivityItem[];
};

export type CrmInteractionRow = {
  id: string;
  interactionNumber: string;
  customerId: string;
  caseId: string | null;
  agentId: string;
  channel: CrmChannel;
  interactionType: CrmInteractionType;
  interactionDate: string;
  durationSeconds: number | null;
  duration: string | null;
  inquiry: string | null;
  notes: string | null;
  resolution: CrmResolution | null;
  status: CrmInteractionStatus;
  priority: CrmPriority;
  customer: CrmCustomerRef;
  case: { id: string; caseNumber: string; subject: string; status: string } | null;
  agent: CrmUserRef | null;
};

export type CrmInteractionDetail = CrmInteractionRow & {
  followUps: CrmFollowUpRow[];
  comments: Array<{
    id: string;
    comment: string;
    createdAt: string;
    user: CrmUserRef | null;
  }>;
};

export type CrmCaseRow = {
  id: string;
  caseNumber: string;
  customerId: string;
  subject: string;
  description: string | null;
  priority: CrmPriority;
  status: CrmCaseStatus;
  assignedToId: string | null;
  closedAt: string | null;
  createdAt: string;
  customer: CrmCustomerRef;
  assignedTo: CrmUserRef | null;
  interactionCount: number;
  followUpCount: number;
};

export type CrmFollowUpRow = {
  id: string;
  interactionId: string | null;
  caseId: string | null;
  customerId: string;
  assignedToId: string;
  followUpDate: string;
  followUpType: CrmFollowUpType;
  notes: string | null;
  status: CrmFollowUpStatus;
  customer: CrmCustomerRef;
  assignedTo: CrmUserRef | null;
  interaction: { id: string; interactionNumber: string } | null;
  case: { id: string; caseNumber: string; subject: string } | null;
};

export type CrmLookups = {
  agents: CrmUserRef[];
  channels: CrmChannel[];
  interactionTypes: CrmInteractionType[];
  resolutions: CrmResolution[];
  interactionStatuses: CrmInteractionStatus[];
  priorities: CrmPriority[];
  caseStatuses: CrmCaseStatus[];
  followUpStatuses: CrmFollowUpStatus[];
  followUpTypes: CrmFollowUpType[];
};

export type CrmDashboard = {
  todayInteractions: number;
  openCases: number;
  pendingFollowUps: number;
  resolvedToday: number;
  recentInteractions: CrmInteractionRow[];
  pendingFollowUpItems: CrmFollowUpRow[];
};

export const CHANNEL_LABELS: Record<CrmChannel, string> = {
  PHONE: 'Phone',
  EMAIL: 'Email',
  CHAT: 'Chat',
  WALK_IN: 'Walk-in',
  OTHER: 'Other',
};

export const INTERACTION_TYPE_LABELS: Record<CrmInteractionType, string> = {
  INBOUND_CALL: 'Inbound Call',
  OUTBOUND_CALL: 'Outbound Call',
  EMAIL: 'Email',
  CHAT: 'Chat',
  OTHER: 'Other',
};

export const INQUIRY_OPTIONS = [
  'General Enquiry',
  'New Retail Order',
  'Update/Amend Order',
  'Where is my Order',
  'Returns/Refunds',
  'Script Enquiry',
  'Chempro Store Enquiry',
  'Customer Account Enquiry',
  'Lead Generation',
  'Others',
] as const;

export const RESOLUTION_LABELS: Record<CrmResolution, string> = {
  RESOLVED_FIRST_CONTACT: 'Resolved on First Call/Contact',
  RESOLVED: 'Resolved',
  CALLBACK_REQUIRED: 'Customer Callback Required',
  PENDING: 'Pending',
  ESCALATED: 'Escalated',
  NO_RESOLUTION: 'No Resolution',
  OTHER: 'Other',
};

export const INTERACTION_STATUS_LABELS: Record<CrmInteractionStatus, string> = {
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  CANCELLED: 'Cancelled',
};

export const PRIORITY_LABELS: Record<CrmPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const CASE_STATUS_LABELS: Record<CrmCaseStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const FOLLOW_UP_STATUS_LABELS: Record<CrmFollowUpStatus, string> = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const FOLLOW_UP_TYPE_LABELS: Record<CrmFollowUpType, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  VISIT: 'Visit',
  OTHER: 'Other',
};

export const textareaClassName =
  'min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30';

export const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function customerTitle(customer: Pick<CrmCustomerRef, 'name' | 'storeName'>) {
  return customer.storeName || customer.name;
}

export function previewText(value: string | null | undefined, max = 60) {
  if (!value) return '—';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toDateTimeLocal(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toDateInput(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export async function downloadInteractionsCsv(query: Record<string, string | undefined>) {
  const url = new URL(`${API_URL}/crm/interactions/export`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const token = getAccessToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'crm-interactions.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}
