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

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

type SupplierFormState = {
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
};

const emptyForm: SupplierFormState = {
  code: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  isActive: true,
};

export default function SuppliersPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [form, setForm] = useState<SupplierFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SupplierRow | null>(null);
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

  function openEdit(supplier: SupplierRow) {
    setEditing(supplier);
    setForm({
      code: supplier.code,
      name: supplier.name,
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      isActive: supplier.isActive,
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
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        isActive: form.isActive,
      };
      if (editing) {
        await apiRequest(`/suppliers/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/suppliers', { method: 'POST', body });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/suppliers/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete supplier');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<SupplierRow>
        key={reloadKey}
        title="Suppliers"
        description="Vendors you buy products from."
        endpoint="/suppliers"
        permission="suppliers.view"
        canCreate={can('suppliers.create')}
        createLabel="New supplier"
        onCreate={openCreate}
        columns={[
          {
            key: 'code',
            header: 'Code',
            render: (s) => <span className="mono text-xs">{s.code}</span>,
          },
          { key: 'name', header: 'Name', render: (s) => s.name },
          { key: 'email', header: 'Email', render: (s) => s.email ?? '—' },
          { key: 'phone', header: 'Phone', render: (s) => s.phone ?? '—' },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge active={s.isActive} /> },
        ]}
        actions={(supplier) => (
          <RowActions
            actions={[
              ...(can('suppliers.update')
                ? [{ label: 'Edit', onClick: () => openEdit(supplier) }]
                : []),
              ...(can('suppliers.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(supplier);
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
            <DialogTitle>{editing ? 'Edit supplier' : 'Create supplier'}</DialogTitle>
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
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>
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
        title="Delete supplier"
        description={`Delete supplier "${deleteTarget?.name ?? ''}"?`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
