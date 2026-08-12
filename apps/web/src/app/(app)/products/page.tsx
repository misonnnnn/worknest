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

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  trackInventory: boolean;
  isActive: boolean;
};

type ProductFormState = {
  sku: string;
  name: string;
  description: string;
  unit: string;
  trackInventory: boolean;
  isActive: boolean;
};

const emptyForm: ProductFormState = {
  sku: '',
  name: '',
  description: '',
  unit: 'pcs',
  trackInventory: true,
  isActive: true,
};

export default function ProductsPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
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

  function openEdit(product: ProductRow) {
    setEditing(product);
    setForm({
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      unit: product.unit,
      trackInventory: product.trackInventory,
      isActive: product.isActive,
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
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        unit: form.unit,
        trackInventory: form.trackInventory,
        isActive: form.isActive,
      };
      if (editing) {
        await apiRequest(`/products/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/products', { method: 'POST', body });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/products/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<ProductRow>
        key={reloadKey}
        title="Products"
        description="Items you buy and keep in stock."
        endpoint="/products"
        permission="products.view"
        canCreate={can('products.create')}
        createLabel="New product"
        onCreate={openCreate}
        columns={[
          {
            key: 'sku',
            header: 'SKU',
            render: (p) => <span className="mono text-xs">{p.sku}</span>,
          },
          { key: 'name', header: 'Name', render: (p) => p.name },
          { key: 'unit', header: 'Unit', render: (p) => p.unit },
          {
            key: 'track',
            header: 'Tracks stock',
            render: (p) => (p.trackInventory ? 'Yes' : 'No'),
          },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge active={p.isActive} /> },
        ]}
        actions={(product) => (
          <RowActions
            actions={[
              ...(can('products.update')
                ? [{ label: 'Edit', onClick: () => openEdit(product) }]
                : []),
              ...(can('products.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(product);
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
            <DialogTitle>{editing ? 'Edit product' : 'Create product'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
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
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                required
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
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.trackInventory}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, trackInventory: e.target.checked }))
                }
              />
              Track inventory
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
        title="Delete product"
        description={`Delete product "${deleteTarget?.name ?? ''}"?`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
