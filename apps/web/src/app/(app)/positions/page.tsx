'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DepartmentOption = { id: string; name: string; code: string };

type PositionRow = {
  id: string;
  title: string;
  code: string;
  description: string | null;
  departmentId: string | null;
  department: { id: string; name: string; code: string } | null;
  employeeCount: number;
};

type PositionFormState = {
  title: string;
  code: string;
  description: string;
  departmentId: string;
};

const NONE = '__none__';

const emptyForm: PositionFormState = {
  title: '',
  code: '',
  description: '',
  departmentId: NONE,
};

export default function PositionsPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PositionRow | null>(null);
  const [form, setForm] = useState<PositionFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PositionRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!can('departments.view')) return;
    void apiRequest<PaginatedResult<DepartmentOption>>('/departments', {
      query: { page: 1, pageSize: 100, isActive: true },
    })
      .then((data) => setDepartments(data.items))
      .catch(() => setDepartments([]));
  }, [can]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(position: PositionRow) {
    setEditing(position);
    setForm({
      title: position.title,
      code: position.code,
      description: position.description ?? '',
      departmentId: position.departmentId ?? position.department?.id ?? NONE,
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
        title: form.title,
        code: form.code,
        description: form.description || undefined,
        departmentId: form.departmentId === NONE ? null : form.departmentId,
      };
      if (editing) {
        await apiRequest(`/positions/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/positions', { method: 'POST', body });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save position');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/positions/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete position');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<PositionRow>
        key={reloadKey}
        title="Positions"
        description="Job positions across the organization."
        endpoint="/positions"
        permission="positions.view"
        canCreate={can('positions.create')}
        createLabel="New position"
        onCreate={openCreate}
        columns={[
          { key: 'title', header: 'Title', render: (p) => p.title },
          {
            key: 'code',
            header: 'Code',
            render: (p) => <span className="mono text-xs">{p.code}</span>,
          },
          {
            key: 'department',
            header: 'Department',
            render: (p) => p.department?.name || '—',
          },
          { key: 'employees', header: 'Employees', render: (p) => p.employeeCount },
        ]}
        actions={(position) => (
          <RowActions
            actions={[
              ...(can('positions.update')
                ? [{ label: 'Edit', onClick: () => openEdit(position) }]
                : []),
              ...(can('positions.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(position);
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
            <DialogTitle>{editing ? 'Edit position' : 'Create position'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
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
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, departmentId: value ?? NONE }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete position"
        description={`Delete position "${deleteTarget?.title ?? ''}"? Positions with employees cannot be deleted.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
