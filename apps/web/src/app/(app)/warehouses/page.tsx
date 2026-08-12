'use client';

import { FormEvent, useState } from 'react';
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

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

type WarehouseFormState = {
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

const emptyForm: WarehouseFormState = {
  code: '',
  name: '',
  isDefault: false,
  isActive: true,
};

export default function WarehousesPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [form, setForm] = useState<WarehouseFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<WarehouseRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(warehouse: WarehouseRow) {
    setEditing(warehouse);
    setForm({
      code: warehouse.code,
      name: warehouse.name,
      isDefault: warehouse.isDefault,
      isActive: warehouse.isActive,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        code: form.code,
        name: form.name,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      if (editing) {
        await apiRequest(`/warehouses/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/warehouses', { method: 'POST', body });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save warehouse');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/warehouses/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete warehouse');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<WarehouseRow>
        key={reloadKey}
        title="Warehouses"
        description="Places where stock is stored. Start with one main warehouse."
        endpoint="/warehouses"
        permission="warehouses.view"
        canCreate={can('warehouses.create')}
        createLabel="New warehouse"
        onCreate={openCreate}
        columns={[
          {
            key: 'code',
            header: 'Code',
            render: (w) => <span className="mono text-xs">{w.code}</span>,
          },
          { key: 'name', header: 'Name', render: (w) => w.name },
          { key: 'default', header: 'Default', render: (w) => (w.isDefault ? 'Yes' : 'No') },
          { key: 'status', header: 'Status', render: (w) => <StatusBadge active={w.isActive} /> },
        ]}
        actions={(warehouse) => (
          <RowActions
            actions={[
              ...(can('warehouses.update')
                ? [{ label: 'Edit', onClick: () => openEdit(warehouse) }]
                : []),
              ...(can('warehouses.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(warehouse);
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit warehouse' : 'Create warehouse'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isDefault}
                onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
              />
              Default warehouse
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete warehouse"
        description={`Delete warehouse "${deleteTarget?.name ?? ''}"?`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
