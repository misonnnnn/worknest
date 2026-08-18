'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResourceListPage, StatusBadge } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import { customerTitle, type CrmCustomerRow } from '@/lib/crm';
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

type CustomerFormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: CustomerFormState = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  isActive: true,
};

export default function CrmCustomersPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmCustomerRow | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmCustomerRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(customer: CrmCustomerRow) {
    setEditing(customer);
    setForm({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
      isActive: customer.isActive,
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
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        notes: form.notes || null,
        isActive: form.isActive,
      };
      if (editing) {
        await apiRequest(`/crm/customers/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/crm/customers', { method: 'POST', body });
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/crm/customers/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<CrmCustomerRow>
        key={reloadKey}
        title="Customers"
        description="People CSRs talk to across Pharmacy Direct, Chempro, Chemist Outlet, and Chemist Australia."
        endpoint="/crm/customers"
        permission="crm.view"
        searchPlaceholder="Search name, phone, email…"
        canCreate={can('crm.create')}
        createLabel="New customer"
        onCreate={openCreate}
        onRowClick={(customer) => router.push(`/crm/customers/${customer.id}`)}
        columns={[
          { key: 'code', header: 'Code', render: (c) => <span className="mono text-xs">{c.code}</span> },
          { key: 'name', header: 'Customer', render: (c) => c.name },
          { key: 'phone', header: 'Phone', render: (c) => c.phone || '—' },
          { key: 'email', header: 'Email', render: (c) => c.email || '—' },
          { key: 'activity', header: 'Activity', render: (c) => `${c.interactionCount} interactions` },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge active={c.isActive} /> },
        ]}
        actions={(customer) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => router.push(`/crm/customers/${customer.id}`) },
              ...(can('crm.update')
                ? [{ label: 'Edit', onClick: () => openEdit(customer) }]
                : []),
              ...(can('crm.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(customer);
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
            <DialogTitle>{editing ? 'Edit customer' : 'New customer'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="name">Customer name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
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
        title="Delete customer"
        description={`Delete "${deleteTarget ? customerTitle(deleteTarget) : ''}"? Customers with CRM activity cannot be deleted.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
