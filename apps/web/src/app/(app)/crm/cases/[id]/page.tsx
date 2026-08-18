'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/components/auth-provider';
import { InteractionFormDialog } from '@/components/crm/interaction-form-dialog';
import { CaseStatusBadge, FollowUpStatusBadge, InteractionStatusBadge, PriorityBadge } from '@/components/crm/badges';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  CASE_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
  PRIORITY_LABELS,
  customerTitle,
  formatDateTime,
  previewText,
  selectClassName,
  type CrmCaseRow,
  type CrmCaseStatus,
  type CrmCustomerRow,
  type CrmFollowUpRow,
  type CrmInteractionRow,
  type CrmLookups,
  type CrmPriority,
} from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type CaseDetail = CrmCaseRow & {
  interactions: CrmInteractionRow[];
  followUps: CrmFollowUpRow[];
};

export default function CrmCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const [crmCase, setCrmCase] = useState<CaseDetail | null>(null);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [status, setStatus] = useState<CrmCaseStatus>('OPEN');
  const [priority, setPriority] = useState<CrmPriority>('NORMAL');
  const [assignedToId, setAssignedToId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, lookupData] = await Promise.all([
        apiRequest<CaseDetail>(`/crm/cases/${params.id}`),
        apiRequest<CrmLookups>('/crm/lookups'),
      ]);
      setCrmCase(detail);
      setLookups(lookupData);
      setStatus(detail.status);
      setPriority(detail.priority);
      setAssignedToId(detail.assignedToId ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCase() {
    if (!crmCase) return;
    setSaving(true);
    try {
      await apiRequest(`/crm/cases/${crmCase.id}`, {
        method: 'PATCH',
        body: { status, priority, assignedToId: assignedToId || null },
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !crmCase) {
    return <p className="text-sm text-destructive">{error ?? 'Case not found'}</p>;
  }

  const presetCustomer: CrmCustomerRow = {
    ...crmCase.customer,
    notes: null,
    isActive: true,
    interactionCount: 0,
    caseCount: 0,
    followUpCount: 0,
  };

  return (
    <div>
      <PageHeader
        title={crmCase.caseNumber}
        description={crmCase.subject}
        actions={
          can('crm.create') ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              Add interaction
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Customer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <Link className="font-medium underline" href={`/crm/customers/${crmCase.customer.id}`}>
                {customerTitle(crmCase.customer)}
              </Link>
              <p className="mt-1">{crmCase.customer.phone || '—'}</p>
              <p>{crmCase.customer.email || '—'}</p>
            </CardContent>
          </Card>

          {crmCase.description ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Description</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{crmCase.description}</CardContent>
            </Card>
          ) : null}

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Interactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {crmCase.interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No interactions linked yet.</p>
              ) : (
                crmCase.interactions.map((item) => (
                  <Link
                    key={item.id}
                    href={`/crm/interactions/${item.id}`}
                    className="block rounded-md border p-3 hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {INTERACTION_TYPE_LABELS[item.interactionType]}
                      </p>
                      <InteractionStatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(item.interactionDate)} · {item.agent?.displayName}
                    </p>
                    <p className="mt-1 text-sm">{previewText(item.inquiry, 90)}</p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Follow-ups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {crmCase.followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-ups.</p>
              ) : (
                crmCase.followUps.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p>{formatDateTime(item.followUpDate)}</p>
                      <FollowUpStatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 text-muted-foreground">{item.assignedTo?.displayName}</p>
                    {item.notes ? <p className="mt-1">{item.notes}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Case details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <PriorityBadge priority={crmCase.priority} />
              <CaseStatusBadge status={crmCase.status} />
            </div>
            {can('crm.update') || can('crm.manage_cases') ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="caseStatus">Status</Label>
                  <select
                    id="caseStatus"
                    className={selectClassName}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CrmCaseStatus)}
                  >
                    {(lookups?.caseStatuses ?? Object.keys(CASE_STATUS_LABELS)).map((value) => (
                      <option key={value} value={value}>
                        {CASE_STATUS_LABELS[value as CrmCaseStatus]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="casePriority">Priority</Label>
                  <select
                    id="casePriority"
                    className={selectClassName}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as CrmPriority)}
                  >
                    {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABELS[value as CrmPriority]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignedToId">Assigned to</Label>
                  <select
                    id="assignedToId"
                    className={selectClassName}
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                  >
                    {(lookups?.agents ?? []).map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <Button size="sm" disabled={saving} onClick={() => void saveCase()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => router.push('/crm/cases')}>
              Back to cases
            </Button>
          </CardContent>
        </Card>
      </div>

      <InteractionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        presetCustomer={presetCustomer}
        presetCaseId={crmCase.id}
        onSaved={() => void load()}
      />
    </div>
  );
}
