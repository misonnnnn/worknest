export const PERMISSIONS = [
  { key: 'users.view', resource: 'users', action: 'view', description: 'View users' },
  { key: 'users.create', resource: 'users', action: 'create', description: 'Create users' },
  { key: 'users.update', resource: 'users', action: 'update', description: 'Update users' },
  { key: 'users.delete', resource: 'users', action: 'delete', description: 'Delete users' },
  { key: 'roles.view', resource: 'roles', action: 'view', description: 'View roles' },
  { key: 'roles.create', resource: 'roles', action: 'create', description: 'Create roles' },
  { key: 'roles.update', resource: 'roles', action: 'update', description: 'Update roles' },
  { key: 'roles.delete', resource: 'roles', action: 'delete', description: 'Delete roles' },
  { key: 'roles.assign', resource: 'roles', action: 'assign', description: 'Assign roles to users' },
  {
    key: 'permissions.view',
    resource: 'permissions',
    action: 'view',
    description: 'View permissions',
  },
  {
    key: 'departments.view',
    resource: 'departments',
    action: 'view',
    description: 'View departments',
  },
  {
    key: 'departments.create',
    resource: 'departments',
    action: 'create',
    description: 'Create departments',
  },
  {
    key: 'departments.update',
    resource: 'departments',
    action: 'update',
    description: 'Update departments',
  },
  {
    key: 'departments.delete',
    resource: 'departments',
    action: 'delete',
    description: 'Delete departments',
  },
  { key: 'positions.view', resource: 'positions', action: 'view', description: 'View positions' },
  {
    key: 'positions.create',
    resource: 'positions',
    action: 'create',
    description: 'Create positions',
  },
  {
    key: 'positions.update',
    resource: 'positions',
    action: 'update',
    description: 'Update positions',
  },
  {
    key: 'positions.delete',
    resource: 'positions',
    action: 'delete',
    description: 'Delete positions',
  },
  { key: 'employees.view', resource: 'employees', action: 'view', description: 'View employees' },
  {
    key: 'employees.create',
    resource: 'employees',
    action: 'create',
    description: 'Create employees',
  },
  {
    key: 'employees.update',
    resource: 'employees',
    action: 'update',
    description: 'Update employees',
  },
  {
    key: 'employees.delete',
    resource: 'employees',
    action: 'delete',
    description: 'Delete employees',
  },
  {
    key: 'employees.view_salary',
    resource: 'employees',
    action: 'view_salary',
    description: 'View employee salary information',
  },
  {
    key: 'audit-logs.view',
    resource: 'audit-logs',
    action: 'view',
    description: 'View audit logs',
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const SUPER_ADMIN_ROLE = 'Super Admin';
