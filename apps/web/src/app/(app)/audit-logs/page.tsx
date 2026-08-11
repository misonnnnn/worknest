'use client';

import { ResourceListPage } from '@/components/resource-list';
import { Badge } from '@/components/ui/badge';

type AuditRow = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  user: { email: string } | null;
  ipAddress: string | null;
};

export default function AuditLogsPage() {
  return (
    <ResourceListPage<AuditRow>
      title="Audit Logs"
      description="Trail of important system actions."
      endpoint="/audit-logs"
      permission="audit-logs.view"
      columns={[
        {
          key: 'createdAt',
          header: 'When',
          render: (a) => new Date(a.createdAt).toLocaleString(),
        },
        {
          key: 'action',
          header: 'Action',
          render: (a) => (
            <Badge variant="outline" className="rounded-md font-normal">
              {a.action}
            </Badge>
          ),
        },
        { key: 'resource', header: 'Resource', render: (a) => a.resource },
        {
          key: 'resourceId',
          header: 'Resource ID',
          render: (a) => <span className="mono text-xs">{a.resourceId || '—'}</span>,
        },
        { key: 'user', header: 'User', render: (a) => a.user?.email || '—' },
        { key: 'ip', header: 'IP', render: (a) => a.ipAddress || '—' },
      ]}
    />
  );
}
