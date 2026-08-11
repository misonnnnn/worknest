'use client';

import { useMemo, useState } from 'react';
import { ResourceListPage } from '@/components/resource-list';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PermissionRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
};

const ALL = '__all__';

const RESOURCES = [
  'users',
  'roles',
  'permissions',
  'departments',
  'positions',
  'employees',
  'audit-logs',
] as const;

export default function PermissionsPage() {
  const [resource, setResource] = useState(ALL);

  const queryExtras = useMemo(
    () => ({
      resource: resource === ALL ? undefined : resource,
    }),
    [resource],
  );

  return (
    <ResourceListPage<PermissionRow>
      key={resource}
      title="Permissions"
      description="System-defined resource.action permission catalog. Assign these through roles."
      endpoint="/permissions"
      permission="permissions.view"
      pageSize={50}
      queryExtras={queryExtras}
      filters={
        <Select value={resource} onValueChange={(value) => setResource(value ?? ALL)}>
          <SelectTrigger className="h-8 w-full sm:w-44" size="sm">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All resources</SelectItem>
            {RESOURCES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
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
