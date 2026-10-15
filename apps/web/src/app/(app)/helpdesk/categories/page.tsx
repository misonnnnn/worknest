'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import { textareaClassName, type HelpdeskCategory } from '@/lib/helpdesk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type CategoryForm = {
  name: string;
  description: string;
  isActive: boolean;
};

export default function HelpdeskCategoriesPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<HelpdeskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HelpdeskCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>({
    name: '',
    description: '',
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HelpdeskCategory | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    if (!can('helpdesk.manage_categories')) {
      setError('You do not have permission to manage categories.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await apiRequest<HelpdeskCategory[]>('/helpdesk/categories'));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', isActive: true });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(category: HelpdeskCategory) {
    setEditing(category);
    setForm({
      name: category.name,
      description: category.description ?? '',
      isActive: category.isActive ?? true,
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
        description: form.description || null,
        isActive: form.isActive,
      };
      if (editing) {
        await apiRequest(`/helpdesk/categories/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/helpdesk/categories', { method: 'POST', body });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    setDeactivateError(null);
    try {
      await apiRequest(`/helpdesk/categories/${deactivateTarget.id}`, { method: 'DELETE' });
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      setDeactivateError(
        err instanceof ApiClientError ? err.message : 'Failed to deactivate category',
      );
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ticket Categories"
        description="Manage IT helpdesk categories."
        actions={
          can('helpdesk.manage_categories') ? (
            <Button size="sm" onClick={openCreate}>
              New category
            </Button>
          ) : undefined
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No categories found.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{category.description || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={category.isActive ? 'secondary' : 'outline'}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        actions={[
                          { label: 'Edit', onClick: () => openEdit(category) },
                          ...(category.isActive
                            ? [
                                {
                                  label: 'Deactivate',
                                  variant: 'destructive' as const,
                                  onClick: () => {
                                    setDeactivateError(null);
                                    setDeactivateTarget(category);
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
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
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className={textareaClassName}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
            <DialogFooter>
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
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title="Deactivate category"
        description={`Deactivate ${deactivateTarget?.name ?? 'this category'}? Existing tickets keep their category reference.`}
        loading={deactivating}
        error={deactivateError}
        onConfirm={onDeactivate}
      />
    </div>
  );
}
