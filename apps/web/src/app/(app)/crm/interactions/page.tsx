'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { InteractionFormDialog } from '@/components/crm/interaction-form-dialog';
import { InteractionStatusBadge, PriorityBadge } from '@/components/crm/badges';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  CHANNEL_LABELS,
  INTERACTION_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
  PRIORITY_LABELS,
  customerTitle,
  downloadInteractionsCsv,
  formatDateTime,
  previewText,
  selectClassName,
  type CrmChannel,
  type CrmInteractionRow,
  type CrmInteractionStatus,
  type CrmInteractionType,
  type CrmLookups,
  type CrmPriority,
} from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CrmInteractionsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmInteractionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmInteractionRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [channel, setChannel] = useState('');
  const [interactionType, setInteractionType] = useState('');

  useEffect(() => {
    void apiRequest<CrmLookups>('/crm/lookups').then(setLookups).catch(() => undefined);
  }, []);

  const queryExtras = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      agentId: agentId || undefined,
      status: status || undefined,
      priority: priority || undefined,
      channel: channel || undefined,
      interactionType: interactionType || undefined,
    }),
    [dateFrom, dateTo, agentId, status, priority, channel, interactionType],
  );

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/crm/interactions/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete interaction');
    } finally {
      setDeleting(false);
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      await downloadInteractionsCsv(queryExtras);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <ResourceListPage<CrmInteractionRow>
        key={reloadKey}
        title="Interactions"
        description="Customer calls, emails, and other contacts."
        endpoint="/crm/interactions"
        permission="crm.view"
        searchPlaceholder="Search customer, phone, email, case ID, inquiry…"
        canCreate={can('crm.create')}
        createLabel="Add interaction"
        onCreate={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        onRowClick={(item) => router.push(`/crm/interactions/${item.id}`)}
        queryExtras={queryExtras}
        headerActions={
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => void onExport()}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        }
        filters={
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[140px]"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[140px]"
            />
            <select className={selectClassName} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">All agents</option>
              {(lookups?.agents ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.displayName}
                </option>
              ))}
            </select>
            <select className={selectClassName} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {(lookups?.interactionStatuses ?? Object.keys(INTERACTION_STATUS_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {INTERACTION_STATUS_LABELS[value as CrmInteractionStatus]}
                </option>
              ))}
            </select>
            <select
              className={selectClassName}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">All priorities</option>
              {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value as CrmPriority]}
                </option>
              ))}
            </select>
            <select className={selectClassName} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">All channels</option>
              {(lookups?.channels ?? Object.keys(CHANNEL_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {CHANNEL_LABELS[value as CrmChannel]}
                </option>
              ))}
            </select>
            <select
              className={selectClassName}
              value={interactionType}
              onChange={(e) => setInteractionType(e.target.value)}
            >
              <option value="">All types</option>
              {(lookups?.interactionTypes ?? Object.keys(INTERACTION_TYPE_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {INTERACTION_TYPE_LABELS[value as CrmInteractionType]}
                </option>
              ))}
            </select>
          </div>
        }
        columns={[
          { key: 'date', header: 'Date', render: (i) => formatDateTime(i.interactionDate) },
          {
            key: 'case',
            header: 'Case ID',
            render: (i) => <span className="mono text-xs">{i.case?.caseNumber ?? '—'}</span>,
          },
          { key: 'customer', header: 'Customer', render: (i) => customerTitle(i.customer) },
          { key: 'phone', header: 'Phone', render: (i) => i.customer.phone || '—' },
          { key: 'issue', header: 'Issue', render: (i) => previewText(i.inquiry, 50) },
          { key: 'agent', header: 'Agent', render: (i) => i.agent?.displayName ?? '—' },
          { key: 'duration', header: 'Duration', render: (i) => i.duration ?? '—' },
          { key: 'priority', header: 'Priority', render: (i) => <PriorityBadge priority={i.priority} /> },
          { key: 'status', header: 'Status', render: (i) => <InteractionStatusBadge status={i.status} /> },
        ]}
        actions={(item) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => router.push(`/crm/interactions/${item.id}`) },
              ...(can('crm.update')
                ? [
                    {
                      label: 'Edit',
                      onClick: () => {
                        setEditing(item);
                        setFormOpen(true);
                      },
                    },
                  ]
                : []),
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

      <InteractionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        editing={editing}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete interaction"
        description={`Delete ${deleteTarget?.interactionNumber ?? 'this interaction'}?`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
