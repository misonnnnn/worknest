import type { PaginatedResult } from '@worknest/types';

export function buildPagination(page: number, pageSize: number, total: number): Omit<
  PaginatedResult<unknown>,
  'items'
> {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getClientMeta(req: {
  ip?: string;
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}) {
  const forwarded = req.headers['x-forwarded-for'];
  const ipFromForwarded =
    typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined;
  return {
    ipAddress: ipFromForwarded || req.ip || req.socket?.remoteAddress || null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}
