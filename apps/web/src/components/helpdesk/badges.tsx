'use client';

import { Badge } from '@/components/ui/badge';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type ITTicketPriority,
  type ITTicketStatus,
} from '@/lib/helpdesk';

export function TicketPriorityBadge({ priority }: { priority: ITTicketPriority | string }) {
  const variant =
    priority === 'CRITICAL' || priority === 'HIGH'
      ? 'destructive'
      : priority === 'LOW'
        ? 'outline'
        : 'secondary';
  return (
    <Badge variant={variant} className="rounded-md font-normal">
      {PRIORITY_LABELS[priority as ITTicketPriority] ?? priority}
    </Badge>
  );
}

export function TicketStatusBadge({ status }: { status: ITTicketStatus | string }) {
  const variant =
    status === 'RESOLVED' || status === 'CLOSED'
      ? 'secondary'
      : status === 'CANCELLED'
        ? 'destructive'
        : status === 'OPEN' || status === 'PENDING'
          ? 'outline'
          : 'default';
  return (
    <Badge variant={variant} className="rounded-md font-normal">
      {STATUS_LABELS[status as ITTicketStatus] ?? status}
    </Badge>
  );
}
