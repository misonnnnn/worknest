'use client';

import { Badge } from '@/components/ui/badge';
import {
  CASE_STATUS_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  INTERACTION_STATUS_LABELS,
  PRIORITY_LABELS,
  type CrmCaseStatus,
  type CrmFollowUpStatus,
  type CrmInteractionStatus,
  type CrmPriority,
} from '@/lib/crm';

export function PriorityBadge({ priority }: { priority: CrmPriority | string }) {
  const variant =
    priority === 'URGENT' || priority === 'HIGH'
      ? 'destructive'
      : priority === 'LOW'
        ? 'outline'
        : 'secondary';
  return (
    <Badge variant={variant} className="rounded-md font-normal">
      {PRIORITY_LABELS[priority as CrmPriority] ?? priority}
    </Badge>
  );
}

export function InteractionStatusBadge({ status }: { status: CrmInteractionStatus | string }) {
  const variant =
    status === 'COMPLETED'
      ? 'secondary'
      : status === 'CANCELLED'
        ? 'destructive'
        : status === 'PENDING'
          ? 'outline'
          : 'default';
  return (
    <Badge variant={variant} className="rounded-md font-normal">
      {INTERACTION_STATUS_LABELS[status as CrmInteractionStatus] ?? status}
    </Badge>
  );
}

export function CaseStatusBadge({ status }: { status: CrmCaseStatus | string }) {
  const variant =
    status === 'RESOLVED' || status === 'CLOSED'
      ? 'secondary'
      : status === 'CANCELLED'
        ? 'destructive'
        : status === 'OPEN'
          ? 'outline'
          : 'default';
  return (
    <Badge variant={variant} className="rounded-md font-normal">
      {CASE_STATUS_LABELS[status as CrmCaseStatus] ?? status}
    </Badge>
  );
}

export function FollowUpStatusBadge({ status }: { status: CrmFollowUpStatus | string }) {
  const variant =
    status === 'COMPLETED' ? 'secondary' : status === 'CANCELLED' ? 'destructive' : 'outline';
  return (
    <Badge variant={variant} className="rounded-md font-normal">
      {FOLLOW_UP_STATUS_LABELS[status as CrmFollowUpStatus] ?? status}
    </Badge>
  );
}
