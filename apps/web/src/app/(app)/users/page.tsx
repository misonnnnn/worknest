'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
import { ResourceListPage, StatusBadge } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE = '__none__';

type RoleOption = { id: string; name: string };

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  user: { id: string } | null;
};

type UserRow = {
  id: string;
  email: string;
  isActive: boolean;
  roles: RoleOption[];
  lastLoginAt: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
};

type UserFormState = {
  email: string;
  password: string;
  isActive: boolean;
  employeeId: string;
};

const emptyForm: UserFormState = {
  email: '',
  password: '',
  isActive: true,
  employeeId: NONE,
};

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesUser, setRolesUser] = useState<UserRow | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesSaving, setRolesSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!can('roles.view') && !can('roles.assign')) return;
    void apiRequest<PaginatedResult<RoleOption>>('/roles', {
      query: { page: 1, pageSize: 100 },
    })
      .then((data) => setRoles(data.items.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setRoles([]));
  }, [can]);

  useEffect(() => {
    if (!can('employees.view')) return;
    void apiRequest<PaginatedResult<EmployeeOption>>('/employees', {
      query: { page: 1, pageSize: 100 },
    })
      .then((data) => setEmployees(data.items))
      .catch(() => setEmployees([]));
  }, [can, reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    setForm({
      email: user.email,
      password: '',
      isActive: user.isActive,
      employeeId: user.employee?.id ?? NONE,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openRoles(user: UserRow) {
    setRolesUser(user);
    setSelectedRoleIds(user.roles.map((r) => r.id));
    setRolesError(null);
    setRolesOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const body: {
          email: string;
          isActive: boolean;
          password?: string;
          employeeId: string | null;
        } = {
          email: form.email,
          isActive: form.isActive,
          employeeId: form.employeeId === NONE ? null : form.employeeId,
        };
        if (form.password.trim()) body.password = form.password;
        await apiRequest(`/users/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/users', {
          method: 'POST',
          body: {
            email: form.email,
            password: form.password,
            isActive: form.isActive,
            employeeId: form.employeeId === NONE ? null : form.employeeId,
          },
        });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  }

  async function onSaveRoles() {
    if (!rolesUser) return;
    setRolesSaving(true);
    setRolesError(null);
    try {
      await apiRequest(`/users/${rolesUser.id}/roles`, {
        method: 'PUT',
        body: { roleIds: selectedRoleIds },
      });
      setRolesOpen(false);
      refresh();
    } catch (err) {
      setRolesError(err instanceof ApiClientError ? err.message : 'Failed to assign roles');
    } finally {
      setRolesSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<UserRow>
        key={reloadKey}
        title="Users"
        description="Manage application users and their access."
        endpoint="/users"
        permission="users.view"
        canCreate={can('users.create')}
        createLabel="New user"
        onCreate={openCreate}
        columns={[
          { key: 'email', header: 'Email', render: (u) => u.email },
          {
            key: 'employee',
            header: 'Employee',
            render: (u) =>
              u.employee
                ? `${u.employee.firstName} ${u.employee.lastName} (${u.employee.employeeNumber})`
                : '—',
          },
          {
            key: 'roles',
            header: 'Roles',
            render: (u) => u.roles.map((r) => r.name).join(', ') || '—',
          },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge active={u.isActive} /> },
          {
            key: 'lastLoginAt',
            header: 'Last login',
            render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'),
          },
        ]}
        actions={(u) => {
          const isSelf = me?.id === u.id;
          return (
            <RowActions
              actions={[
                ...(can('users.update')
                  ? [{ label: 'Edit', onClick: () => openEdit(u) }]
                  : []),
                ...(can('roles.assign')
                  ? [{ label: 'Roles', onClick: () => openRoles(u) }]
                  : []),
                ...(can('users.delete')
                  ? [
                      {
                        label: 'Delete',
                        variant: 'destructive' as const,
                        disabled: isSelf,
                        onClick: () => {
                          setDeleteError(null);
                          setDeleteTarget(u);
                        },
                      },
                    ]
                  : []),
              ]}
            />
          );
        }}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit user' : 'Create user'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">
                Password{editing ? ' (leave blank to keep current)' : ''}
              </Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                minLength={editing ? undefined : 8}
                required={!editing}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active account
            </label>
            {can('employees.view') ? (
              <div className="space-y-1.5">
                <Label>Linked employee</Label>
                <Select
                  value={form.employeeId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, employeeId: value ?? NONE }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No employee</SelectItem>
                    {employees
                      .filter(
                        (employee) =>
                          !employee.user || employee.user.id === editing?.id,
                      )
                      .map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName} ({employee.employeeNumber})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign roles</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rolesError ? <p className="text-sm text-destructive">{rolesError}</p> : null}
            <p className="text-sm text-muted-foreground">{rolesUser?.email}</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles available.</p>
              ) : (
                roles.map((role) => {
                  const checked = selectedRoleIds.includes(role.id);
                  return (
                    <label key={role.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          setSelectedRoleIds((prev) =>
                            e.target.checked
                              ? [...prev, role.id]
                              : prev.filter((id) => id !== role.id),
                          );
                        }}
                      />
                      {role.name}
                    </label>
                  );
                })
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRolesOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={rolesSaving} onClick={() => void onSaveRoles()}>
                {rolesSaving ? 'Saving…' : 'Save roles'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete user"
        description={`Delete ${deleteTarget?.email ?? 'this user'}? This cannot be undone.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
