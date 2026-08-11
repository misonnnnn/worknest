'use client';

import { ResourceListPage } from '@/components/resource-list';

type PermissionRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
};

export default function PermissionsPage() {
  return (
    <ResourceListPage<PermissionRow>
      title="Permissions"
      description="Canonical resource.action permission catalog."
      endpoint="/permissions"
      permission="permissions.view"
      columns={[
        {
          key: 'key',
          header: 'Key',
          render: (p) => <span className="mono text-xs">{p.key}</span>,
        },
        { key: 'resource', header: 'Resource', render: (p) => p.resource },
        { key: 'action', header: 'Action', render: (p) => p.action },
        { key: 'description', header: 'Description', render: (p) => p.description || '—' },
      ]}
    />
  );
}
