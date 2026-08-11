'use client';

import { ResourceListPage } from '@/components/resource-list';

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Array<{ key: string }>;
};

export default function RolesPage() {
  return (
    <ResourceListPage<RoleRow>
      title="Roles"
      description="Roles bundle permissions for RBAC assignment."
      endpoint="/roles"
      permission="roles.view"
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'description', header: 'Description', render: (r) => r.description || '—' },
        { key: 'users', header: 'Users', render: (r) => r.userCount },
        {
          key: 'permissions',
          header: 'Permissions',
          render: (r) => r.permissions.length,
        },
      ]}
    />
  );
}
