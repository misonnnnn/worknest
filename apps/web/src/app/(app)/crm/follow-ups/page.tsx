'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { CustomerPicker } from '@/components/crm/customer-picker';
import { FollowUpStatusBadge } from '@/components/crm/badges';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  customerTitle,
  formatDateTime,
  previewText,
  selectClassName,
  textareaClassName,
  toDateTimeLocal,
  type CrmCustomerRow,
  type CrmFollowUpRow,
  type CrmFollowUpStatus,
  type CrmFollowUpType,
  type CrmLookups,
} from '@/lib/crm';
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

type FollowUpForm = {
  customerId: string;
  assignedToId: string;
  followUpDate: string;
  followUpType: CrmFollowUpType;
  notes: string;
  status: CrmFollowUpStatus;
};

export default function CrmFollowUpsPage() {
  const { can, user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmFollowUpRow | null>(null);
  const [customer, setCustomer] = useState<CrmCustomerRow | null>(null);
  const [form, setForm] = useState<FollowUpForm>({
    customerId: '',
    assignedToId: user?.id ?? '',
    followUpDate: toDateTimeLocal(new Date(Date.now() + 86400000)),
    followUpType: 'CALL',
    notes: '',
    status: 'PENDING',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmFollowUpRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [assignedToId, setAssignedToId] = useState('');

  useEffect(() => {
    void apiRequest<CrmLookups>('/crm/lookups').then(setLookups).catch(() => undefined);
  }, []);

  const queryExtras = useMemo(
    () => ({
      status: statusFilter || undefined,
      assignedToId: assignedToId || undefined,
    }),
    [statusFilter, assignedToId],
  );

  const canWrite = can('crm.create') || can('crm.manage_followups');

  function openCreate() {
    setEditing(null);
    setCustomer(null);
    setForm({
      customerId: '',
      assignedToId: user?.id ?? '',
      followUpDate: toDateTimeLocal(new Date(Date.now() + 86400000)),
      followUpType: 'CALL',
      notes: '',
      status: 'PENDING',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: CrmFollowUpRow) {
    setEditing(item);
    setCustomer({
      ...item.customer,
      notes: null,
      isActive: true,
      interactionCount: 0,
      caseCount: 0,
      followUpCount: 0,
    });
    setForm({
      customerId: item.customerId,
      assignedToId: item.assignedToId,
      followUpDate: toDateTimeLocal(item.followUpDate),
      followUpType: item.followUpType,
      notes: item.notes ?? '',
      status: item.status,
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
        customerId: form.customerId,
        assignedToId: form.assignedToId || undefined,
        followUpDate: new Date(form.followUpDate).toISOString(),
        followUpType: form.followUpType,
        notes: form.notes || null,
        status: form.status,
      };
      if (editing) {
        await apiRequest(`/crm/follow-ups/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/crm/follow-ups', { method: 'POST', body });
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save follow-up');
    } finally {
      setSaving(false);
    }
  }

  async function markDone(item: CrmFollowUpRow) {
    await apiRequest(`/crm/follow-ups/${item.id}`, {
      method: 'PATCH',
      body: { status: 'COMPLETED' },
    });
    setReloadKey((k) => k + 1);
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/crm/follow-ups/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete follow-up');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<CrmFollowUpRow>
        key={reloadKey}
        title="Follow-ups"
        description="Callbacks and later work for customers."
        endpoint="/crm/follow-ups"
        permission="crm.view"
        searchPlaceholder="Search customer or notes…"
        canCreate={canWrite}
        createLabel="New follow-up"
        onCreate={openCreate}
        queryExtras={queryExtras}
        filters={
          <div className="flex flex-wrap gap-2">
            <select
              className={selectClassName}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {(lookups?.followUpStatuses ?? Object.keys(FOLLOW_UP_STATUS_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {FOLLOW_UP_STATUS_LABELS[value as CrmFollowUpStatus]}
                </option>
              ))}
            </select>
            <select
              className={selectClassName}
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
            >
              <option value="">All agents</option>
              {(lookups?.agents ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.displayName}
                </option>
              ))}
            </select>
          </div>
        }
        columns={[
          { key: 'date', header: 'Follow-up date', render: (f) => formatDateTime(f.followUpDate) },
          { key: 'customer', header: 'Customer', render: (f) => customerTitle(f.customer) },
          { key: 'type', header: 'Type', render: (f) => FOLLOW_UP_TYPE_LABELS[f.followUpType] },
          { key: 'assigned', header: 'Assigned to', render: (f) => f.assignedTo?.displayName ?? '—' },
          { key: 'notes', header: 'Notes', render: (f) => previewText(f.notes, 50) },
          { key: 'status', header: 'Status', render: (f) => <FollowUpStatusBadge status={f.status} /> },
        ]}
        actions={(item) => (
          <RowActions
            actions={[
              ...(canWrite && item.status === 'PENDING'
                ? [{ label: 'Complete', onClick: () => void markDone(item) }]
                : []),
              ...(canWrite ? [{ label: 'Edit', onClick: () => openEdit(item) }] : []),
              ...(can('crm.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(item);
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit follow-up' : 'New follow-up'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            {!editing ? (
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <CustomerPicker
                  value={form.customerId}
                  selectedLabel={customer ? customerTitle(customer) : ''}
                  allowCreate
                  onSelect={(selected) => {
                    setCustomer(selected);
                    setForm((prev) => ({ ...prev, customerId: selected.id }));
                  }}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="followUpDate">Follow-up date</Label>
              <Input
                id="followUpDate"
                type="datetime-local"
                value={form.followUpDate}
                onChange={(e) => setForm((prev) => ({ ...prev, followUpDate: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="followUpType">Type</Label>
                <select
                  id="followUpType"
                  className={selectClassName}
                  value={form.followUpType}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, followUpType: e.target.value as CrmFollowUpType }))
                  }
                >
                  {(lookups?.followUpTypes ?? Object.keys(FOLLOW_UP_TYPE_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {FOLLOW_UP_TYPE_LABELS[value as CrmFollowUpType]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className={selectClassName}
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value as CrmFollowUpStatus }))
                  }
                >
                  {(lookups?.followUpStatuses ?? Object.keys(FOLLOW_UP_STATUS_LABELS)).map(
                    (value) => (
                      <option key={value} value={value}>
                        {FOLLOW_UP_STATUS_LABELS[value as CrmFollowUpStatus]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedToId">Assigned employee</Label>
              <select
                id="assignedToId"
                className={selectClassName}
                value={form.assignedToId}
                onChange={(e) => setForm((prev) => ({ ...prev, assignedToId: e.target.value }))}
              >
                {(lookups?.agents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className={textareaClassName}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
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
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete follow-up"
        description="Delete this follow-up?"
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
