'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { CustomerPicker } from '@/components/crm/customer-picker';
import { CaseStatusBadge, PriorityBadge } from '@/components/crm/badges';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  CASE_STATUS_LABELS,
  PRIORITY_LABELS,
  customerTitle,
  formatDateTime,
  previewText,
  selectClassName,
  textareaClassName,
  type CrmCaseRow,
  type CrmCaseStatus,
  type CrmCustomerRow,
  type CrmLookups,
  type CrmPriority,
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

type CaseForm = {
  customerId: string;
  subject: string;
  description: string;
  priority: CrmPriority;
  status: CrmCaseStatus;
  assignedToId: string;
};

export default function CrmCasesPage() {
  const { can, user } = useAuth();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmCaseRow | null>(null);
  const [customer, setCustomer] = useState<CrmCustomerRow | null>(null);
  const [form, setForm] = useState<CaseForm>({
    customerId: '',
    subject: '',
    description: '',
    priority: 'NORMAL',
    status: 'OPEN',
    assignedToId: user?.id ?? '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmCaseRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  useEffect(() => {
    void apiRequest<CrmLookups>('/crm/lookups').then(setLookups).catch(() => undefined);
  }, []);

  const queryExtras = useMemo(
    () => ({
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
    }),
    [statusFilter, priorityFilter],
  );

  const canWrite = can('crm.create') || can('crm.manage_cases');

  function openCreate() {
    setEditing(null);
    setCustomer(null);
    setForm({
      customerId: '',
      subject: '',
      description: '',
      priority: 'NORMAL',
      status: 'OPEN',
      assignedToId: user?.id ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(crmCase: CrmCaseRow) {
    setEditing(crmCase);
    setCustomer({
      ...crmCase.customer,
      notes: null,
      isActive: true,
      interactionCount: 0,
      caseCount: 0,
      followUpCount: 0,
    });
    setForm({
      customerId: crmCase.customerId,
      subject: crmCase.subject,
      description: crmCase.description ?? '',
      priority: crmCase.priority,
      status: crmCase.status,
      assignedToId: crmCase.assignedToId ?? user?.id ?? '',
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
        subject: form.subject,
        description: form.description || null,
        priority: form.priority,
        status: form.status,
        assignedToId: form.assignedToId || null,
      };
      if (editing) {
        await apiRequest(`/crm/cases/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/crm/cases', { method: 'POST', body });
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save case');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/crm/cases/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete case');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<CrmCaseRow>
        key={reloadKey}
        title="Cases"
        description="Customer issues that need more than one contact."
        endpoint="/crm/cases"
        permission="crm.view"
        searchPlaceholder="Search case ID, subject, or customer…"
        canCreate={canWrite}
        createLabel="New case"
        onCreate={openCreate}
        onRowClick={(crmCase) => router.push(`/crm/cases/${crmCase.id}`)}
        queryExtras={queryExtras}
        filters={
          <div className="flex flex-wrap gap-2">
            <select
              className={selectClassName}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {(lookups?.caseStatuses ?? Object.keys(CASE_STATUS_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {CASE_STATUS_LABELS[value as CrmCaseStatus]}
                </option>
              ))}
            </select>
            <select
              className={selectClassName}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All priorities</option>
              {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value as CrmPriority]}
                </option>
              ))}
            </select>
          </div>
        }
        columns={[
          {
            key: 'number',
            header: 'Case',
            render: (c) => <span className="mono text-xs">{c.caseNumber}</span>,
          },
          { key: 'customer', header: 'Customer', render: (c) => customerTitle(c.customer) },
          { key: 'subject', header: 'Subject', render: (c) => previewText(c.subject, 50) },
          { key: 'priority', header: 'Priority', render: (c) => <PriorityBadge priority={c.priority} /> },
          { key: 'status', header: 'Status', render: (c) => <CaseStatusBadge status={c.status} /> },
          { key: 'assigned', header: 'Assigned to', render: (c) => c.assignedTo?.displayName ?? '—' },
          { key: 'created', header: 'Opened', render: (c) => formatDateTime(c.createdAt) },
        ]}
        actions={(crmCase) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => router.push(`/crm/cases/${crmCase.id}`) },
              ...(can('crm.update') || can('crm.manage_cases')
                ? [{ label: 'Edit', onClick: () => openEdit(crmCase) }]
                : []),
              ...(can('crm.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(crmCase);
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
            <DialogTitle>{editing ? 'Edit case' : 'New case'}</DialogTitle>
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
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={form.subject}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  className={selectClassName}
                  value={form.priority}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, priority: e.target.value as CrmPriority }))
                  }
                >
                  {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value as CrmPriority]}
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
                    setForm((prev) => ({ ...prev, status: e.target.value as CrmCaseStatus }))
                  }
                >
                  {(lookups?.caseStatuses ?? Object.keys(CASE_STATUS_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {CASE_STATUS_LABELS[value as CrmCaseStatus]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedToId">Assigned to</Label>
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
        title="Delete case"
        description={`Delete ${deleteTarget?.caseNumber ?? 'this case'}? Cases with interactions cannot be deleted.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
