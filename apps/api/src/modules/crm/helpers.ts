import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

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

export const customerRefSelect = {
  id: true,
  code: true,
  name: true,
  storeName: true,
  phone: true,
  email: true,
  address: true,
} as const;

export const interactionInclude = {
  customer: { select: customerRefSelect },
  case: { select: { id: true, caseNumber: true, subject: true, status: true } },
  agent: { select: userRefSelect },
} as const;

export const caseInclude = {
  customer: { select: customerRefSelect },
  assignedTo: { select: userRefSelect },
  _count: { select: { interactions: true, followUps: true } },
} as const;

export const followUpInclude = {
  customer: { select: customerRefSelect },
  assignedTo: { select: userRefSelect },
  interaction: { select: { id: true, interactionNumber: true } },
  case: { select: { id: true, caseNumber: true, subject: true } },
} as const;

export function mapInteraction(row: {
  customer: Prisma.CustomerGetPayload<{ select: typeof customerRefSelect }>;
  case: { id: string; caseNumber: string; subject: string; status: string } | null;
  agent: UserRefRecord;
  durationSeconds: number | null;
  [key: string]: unknown;
}) {
  const { agent, durationSeconds, ...rest } = row;
  return {
    ...rest,
    durationSeconds,
    duration: formatDuration(durationSeconds),
    agent: mapUserRef(agent),
  };
}

export function mapCase(row: {
  assignedTo: UserRefRecord | null;
  _count?: { interactions: number; followUps: number };
  [key: string]: unknown;
}) {
  const { assignedTo, _count, ...rest } = row;
  return {
    ...rest,
    assignedTo: mapUserRef(assignedTo),
    interactionCount: _count?.interactions ?? 0,
    followUpCount: _count?.followUps ?? 0,
  };
}

export function mapFollowUp(row: {
  assignedTo: UserRefRecord;
  [key: string]: unknown;
}) {
  const { assignedTo, ...rest } = row;
  return {
    ...rest,
    assignedTo: mapUserRef(assignedTo),
  };
}

export async function nextCustomerCode() {
  const count = await prisma.customer.count();
  return `CUST-${String(count + 1).padStart(5, '0')}`;
}

export async function nextCaseNumber() {
  const count = await prisma.crmCase.count();
  return `CASE-${String(count + 1).padStart(6, '0')}`;
}

export async function nextInteractionNumber() {
  const count = await prisma.crmInteraction.count();
  return `INT-${String(count + 1).padStart(6, '0')}`;
}

/** Accepts "2:16", "02:16", seconds as a number, or empty. */
export function parseDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parts = raw.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return null;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function csvEscape(value: unknown) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function customerSearchWhere(search: string): Prisma.CustomerWhereInput {
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { storeName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ],
  };
}

export async function assertUserExists(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new Error('USER_NOT_FOUND');
}

export const CHANNELS = ['PHONE', 'EMAIL', 'CHAT', 'WALK_IN', 'OTHER'] as const;
export const INTERACTION_TYPES = [
  'INBOUND_CALL',
  'OUTBOUND_CALL',
  'EMAIL',
  'CHAT',
  'OTHER',
] as const;
export const RESOLUTIONS = [
  'RESOLVED_FIRST_CONTACT',
  'RESOLVED',
  'CALLBACK_REQUIRED',
  'PENDING',
  'ESCALATED',
  'NO_RESOLUTION',
  'OTHER',
] as const;
export const INTERACTION_STATUSES = ['COMPLETED', 'PENDING', 'IN_PROGRESS', 'CANCELLED'] as const;
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const CASE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
export const FOLLOW_UP_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const;
export const FOLLOW_UP_TYPES = ['CALL', 'EMAIL', 'VISIT', 'OTHER'] as const;
