'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
import { ResourceListPage } from '@/components/resource-list';
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

const SUPER_ADMIN_ROLE = 'Super Admin';

type PermissionOption = {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Array<{ id: string; key: string }>;
};

type RoleFormState = {
  name: string;
  description: string;
};

const emptyForm: RoleFormState = { name: '', description: '' };

export default function RolesPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [permsOpen, setPermsOpen] = useState(false);
  const [permsRole, setPermsRole] = useState<RoleRow | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [permsError, setPermsError] = useState<string | null>(null);
  const [permsSaving, setPermsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!can('permissions.view') && !can('roles.update')) return;
    void apiRequest<PaginatedResult<PermissionOption>>('/permissions', {
      query: { page: 1, pageSize: 200 },
    })
      .then((data) => setPermissions(data.items))
      .catch(() => setPermissions([]));
  }, [can]);

  const permissionsByResource = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const permission of permissions) {
      const list = map.get(permission.resource) ?? [];
      list.push(permission);
      map.set(permission.resource, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(role: RoleRow) {
    setEditing(role);
    setForm({ name: role.name, description: role.description ?? '' });
    setFormError(null);
    setFormOpen(true);
  }

  function openPermissions(role: RoleRow) {
    setPermsRole(role);
    setSelectedPermissionIds(role.permissions.map((p) => p.id));
    setPermsError(null);
    setPermsOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiRequest(`/roles/${editing.id}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            description: form.description || null,
          },
        });
      } else {
        await apiRequest('/roles', {
          method: 'POST',
          body: {
            name: form.name,
            description: form.description || undefined,
          },
        });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save role');
    } finally {
      setSaving(false);
    }
  }

  async function onSavePermissions() {
    if (!permsRole) return;
    setPermsSaving(true);
    setPermsError(null);
    try {
      await apiRequest(`/roles/${permsRole.id}/permissions`, {
        method: 'PUT',
        body: { permissionIds: selectedPermissionIds },
      });
      setPermsOpen(false);
      refresh();
    } catch (err) {
      setPermsError(
        err instanceof ApiClientError ? err.message : 'Failed to update permissions',
      );
    } finally {
      setPermsSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/roles/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete role');
    } finally {
      setDeleting(false);
    }
  }

  function togglePermission(id: string, checked: boolean) {
    setSelectedPermissionIds((prev) =>
      checked ? [...prev, id] : prev.filter((permissionId) => permissionId !== id),
    );
  }

  function toggleResource(resourcePermissions: PermissionOption[], checked: boolean) {
    const ids = resourcePermissions.map((p) => p.id);
    setSelectedPermissionIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...ids]));
      }
      return prev.filter((id) => !ids.includes(id));
    });
  }

  return (
    <>
      <ResourceListPage<RoleRow>
        key={reloadKey}
        title="Roles"
        description="Roles bundle permissions for RBAC assignment."
        endpoint="/roles"
        permission="roles.view"
        canCreate={can('roles.create')}
        createLabel="New role"
        onCreate={openCreate}
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
        actions={(role) => {
          const isSuperAdmin = role.name === SUPER_ADMIN_ROLE;
          return (
            <RowActions
              actions={[
                ...(can('roles.update')
                  ? [{ label: 'Edit', onClick: () => openEdit(role) }]
                  : []),
                ...(can('roles.update')
                  ? [{ label: 'Permissions', onClick: () => openPermissions(role) }]
                  : []),
                ...(can('roles.delete')
                  ? [
                      {
                        label: 'Delete',
                        variant: 'destructive' as const,
                        disabled: isSuperAdmin,
                        onClick: () => {
                          setDeleteError(null);
                          setDeleteTarget(role);
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
            <DialogTitle>{editing ? 'Edit role' : 'Create role'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
                disabled={editing?.name === SUPER_ADMIN_ROLE}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
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

      <Dialog open={permsOpen} onOpenChange={setPermsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign permissions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {permsError ? <p className="text-sm text-destructive">{permsError}</p> : null}
            <p className="text-sm text-muted-foreground">{permsRole?.name}</p>
            <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-lg border p-3">
              {permissionsByResource.length === 0 ? (
                <p className="text-sm text-muted-foreground">No permissions available.</p>
              ) : (
                permissionsByResource.map(([resource, items]) => {
                  const allChecked = items.every((p) => selectedPermissionIds.includes(p.id));
                  return (
                    <div key={resource} className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={allChecked}
                          onChange={(e) => toggleResource(items, e.target.checked)}
                        />
                        {resource}
                      </label>
                      <div className="ml-6 grid gap-1.5 sm:grid-cols-2">
                        {items.map((permission) => (
                          <label key={permission.id} className="flex items-start gap-2 text-sm">
                            <Checkbox
                              className="mt-0.5"
                              checked={selectedPermissionIds.includes(permission.id)}
                              onChange={(e) => togglePermission(permission.id, e.target.checked)}
                            />
                            <span>
                              <span className="mono text-xs">{permission.key}</span>
                              {permission.description ? (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {permission.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPermsOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={permsSaving}
                onClick={() => void onSavePermissions()}
              >
                {permsSaving ? 'Saving…' : 'Save permissions'}
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
        title="Delete role"
        description={`Delete role "${deleteTarget?.name ?? ''}"? Users with only this role will lose its permissions.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
