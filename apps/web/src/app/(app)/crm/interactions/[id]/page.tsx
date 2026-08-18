'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/components/auth-provider';
import { InteractionFormDialog } from '@/components/crm/interaction-form-dialog';
import { FollowUpStatusBadge, InteractionStatusBadge, PriorityBadge } from '@/components/crm/badges';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  CHANNEL_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  INTERACTION_TYPE_LABELS,
  RESOLUTION_LABELS,
  customerTitle,
  formatDateTime,
  selectClassName,
  textareaClassName,
  toDateTimeLocal,
  type CrmFollowUpType,
  type CrmInteractionDetail,
  type CrmLookups,
} from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function CrmInteractionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, user } = useAuth();
  const [item, setItem] = useState<CrmInteractionDetail | null>(null);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(toDateTimeLocal(new Date(Date.now() + 86400000)));
  const [followUpType, setFollowUpType] = useState<CrmFollowUpType>('CALL');
  const [followUpAssignedToId, setFollowUpAssignedToId] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, lookupData] = await Promise.all([
        apiRequest<CrmInteractionDetail>(`/crm/interactions/${params.id}`),
        apiRequest<CrmLookups>('/crm/lookups'),
      ]);
      setItem(detail);
      setLookups(lookupData);
      setFollowUpAssignedToId(detail.agentId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load interaction');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setCommentSaving(true);
    try {
      await apiRequest(`/crm/interactions/${params.id}/comments`, {
        method: 'POST',
        body: { comment },
      });
      setComment('');
      await load();
    } finally {
      setCommentSaving(false);
    }
  }

  async function onFollowUp(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setFollowUpSaving(true);
    setFollowUpError(null);
    try {
      await apiRequest('/crm/follow-ups', {
        method: 'POST',
        body: {
          customerId: item.customerId,
          interactionId: item.id,
          caseId: item.caseId,
          assignedToId: followUpAssignedToId || user?.id,
          followUpDate: new Date(followUpDate).toISOString(),
          followUpType,
          notes: followUpNotes || null,
        },
      });
      setFollowUpOpen(false);
      await load();
    } catch (err) {
      setFollowUpError(err instanceof ApiClientError ? err.message : 'Failed to create follow-up');
    } finally {
      setFollowUpSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/crm/interactions/${params.id}`, { method: 'DELETE' });
      router.push('/crm/interactions');
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return <p className="text-sm text-destructive">{error ?? 'Interaction not found'}</p>;
  }

  return (
    <div>
      <PageHeader
        title={item.interactionNumber}
        description={customerTitle(item.customer)}
        actions={
          <div className="flex gap-2">
            {can('crm.update') ? (
              <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
                Edit
              </Button>
            ) : null}
            {can('crm.create') || can('crm.manage_followups') ? (
              <Button size="sm" variant="outline" onClick={() => setFollowUpOpen(true)}>
                Add follow-up
              </Button>
            ) : null}
            {can('crm.delete') ? (
              <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <Link className="font-medium underline" href={`/crm/customers/${item.customer.id}`}>
                  {customerTitle(item.customer)}
                </Link>
              </p>
              <p>{item.customer.name}</p>
              <p>{item.customer.phone || '—'}</p>
              <p>{item.customer.email || '—'}</p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Interaction</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>{INTERACTION_TYPE_LABELS[item.interactionType]}</p>
              <p>{CHANNEL_LABELS[item.channel]}</p>
              <p>{formatDateTime(item.interactionDate)}</p>
              <p>Agent: {item.agent?.displayName ?? '—'}</p>
              <p>Duration: {item.duration ?? '—'}</p>
              {item.case ? (
                <p>
                  Case:{' '}
                  <Link className="underline" href={`/crm/cases/${item.case.id}`}>
                    {item.case.caseNumber}
                  </Link>
                </p>
              ) : null}
              <div>
                <PriorityBadge priority={item.priority} />
              </div>
              <div>
                <InteractionStatusBadge status={item.status} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Inquiry</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{item.inquiry || '—'}</CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Call notes</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{item.notes || '—'}</CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Resolution</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {item.resolution ? RESOLUTION_LABELS[item.resolution] : '—'}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Follow-up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {item.followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-up required.</p>
              ) : (
                item.followUps.map((followUp) => (
                  <div key={followUp.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p>{formatDateTime(followUp.followUpDate)}</p>
                      <FollowUpStatusBadge status={followUp.status} />
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {FOLLOW_UP_TYPE_LABELS[followUp.followUpType]} · {followUp.assignedTo?.displayName}
                    </p>
                    {followUp.notes ? <p className="mt-1">{followUp.notes}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form className="space-y-2" onSubmit={onComment}>
              <textarea
                className={textareaClassName}
                placeholder="Add a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={commentSaving || !comment.trim()}>
                {commentSaving ? 'Saving…' : 'Add comment'}
              </Button>
            </form>
            {item.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              item.comments.map((entry) => (
                <div key={entry.id} className="rounded-md border p-2 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {entry.user?.displayName} · {formatDateTime(entry.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{entry.comment}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <InteractionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        editing={item}
        onSaved={() => void load()}
      />

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add follow-up</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onFollowUp}>
            {followUpError ? <p className="text-sm text-destructive">{followUpError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="followUpDate">Follow-up date</Label>
              <Input
                id="followUpDate"
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUpType">Type</Label>
              <select
                id="followUpType"
                className={selectClassName}
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value as CrmFollowUpType)}
              >
                {(lookups?.followUpTypes ?? Object.keys(FOLLOW_UP_TYPE_LABELS)).map((value) => (
                  <option key={value} value={value}>
                    {FOLLOW_UP_TYPE_LABELS[value as CrmFollowUpType]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUpAssignedToId">Assigned employee</Label>
              <select
                id="followUpAssignedToId"
                className={selectClassName}
                value={followUpAssignedToId}
                onChange={(e) => setFollowUpAssignedToId(e.target.value)}
              >
                {(lookups?.agents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUpNotes">Notes</Label>
              <textarea
                id="followUpNotes"
                className={textareaClassName}
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFollowUpOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={followUpSaving}>
                {followUpSaving ? 'Saving…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete interaction"
        description={`Delete ${item.interactionNumber}? This cannot be undone.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </div>
  );
}
