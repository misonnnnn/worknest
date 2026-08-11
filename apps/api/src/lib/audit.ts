import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from './prisma';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
]);

export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeForAudit(val);
      }
    }
    return result;
  }
  return value;
}

export type AuditLogInput = {
  userId?: string | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      oldValues: input.oldValues
        ? (sanitizeForAudit(input.oldValues) as Prisma.InputJsonValue)
        : undefined,
      newValues: input.newValues
        ? (sanitizeForAudit(input.newValues) as Prisma.InputJsonValue)
        : undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
