'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/components/auth-provider';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/helpdesk/badges';
import { apiRequest, mediaUrl, ApiClientError } from '@/lib/api';
import {
  HISTORY_ACTION_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatDateTime,
  selectClassName,
  textareaClassName,
  type HelpdeskLookups,
  type HelpdeskTicketDetail,
  type ITTicketPriority,
  type ITTicketStatus,
} from '@/lib/helpdesk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function HelpdeskTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { can, user } = useAuth();
  const [ticket, setTicket] = useState<HelpdeskTicketDetail | null>(null);
  const [lookups, setLookups] = useState<HelpdeskLookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<ITTicketStatus>('OPEN');
  const [priority, setPriority] = useState<ITTicketPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const [confirmAction, setConfirmAction] = useState<'close' | 'cancel' | 'reopen' | null>(null);

  const itRoleNames = ['IT Manager', 'IT Technician', 'Super Admin'];
  const isITStaff =
    Boolean(user?.roles.some((role) => itRoleNames.includes(role.name))) ||
    can('helpdesk.assign') ||
    can('helpdesk.manage_categories');
  const canInternal = isITStaff;
  const isRequester = ticket?.requesterId === user?.id;
  const canComment = Boolean(isRequester || isITStaff);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, lookupData] = await Promise.all([
        apiRequest<HelpdeskTicketDetail>(`/helpdesk/tickets/${params.id}`),
        apiRequest<HelpdeskLookups>('/helpdesk/lookups'),
      ]);
      setTicket(detail);
      setLookups(lookupData);
      setStatus(detail.status);
      setPriority(detail.priority);
      setAssigneeId(detail.assigneeId ?? '');
      setResolutionSummary(detail.resolutionSummary ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setSaving(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  }

  async function savePriority() {
    if (!ticket) return;
    await runAction(() =>
      apiRequest(`/helpdesk/tickets/${ticket.id}/priority`, {
        method: 'POST',
        body: { priority },
      }),
    );
  }

  async function saveStatus() {
    if (!ticket) return;
    await runAction(() =>
      apiRequest(`/helpdesk/tickets/${ticket.id}/status`, {
        method: 'POST',
        body: { status },
      }),
    );
  }

  async function saveAssignee() {
    if (!ticket) return;
    await runAction(() =>
      apiRequest(`/helpdesk/tickets/${ticket.id}/assign`, {
        method: 'POST',
        body: { assigneeId: assigneeId || null },
      }),
    );
  }

  async function resolveTicket(e: FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    await runAction(() =>
      apiRequest(`/helpdesk/tickets/${ticket.id}/resolve`, {
        method: 'POST',
        body: { resolutionSummary },
      }),
    );
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !comment.trim()) return;
    await runAction(async () => {
      await apiRequest(`/helpdesk/tickets/${ticket.id}/comments`, {
        method: 'POST',
        body: { message: comment, isInternal: canInternal ? isInternal : false },
      });
      setComment('');
      setIsInternal(false);
    });
  }

  async function onConfirm() {
    if (!ticket || !confirmAction) return;
    const path =
      confirmAction === 'close'
        ? 'close'
        : confirmAction === 'cancel'
          ? 'cancel'
          : 'reopen';
    await runAction(() =>
      apiRequest(`/helpdesk/tickets/${ticket.id}/${path}`, { method: 'POST' }),
    );
    setConfirmAction(null);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !ticket) {
    return <p className="text-sm text-destructive">{error ?? 'Ticket not found'}</p>;
  }

  return (
    <div>
      <PageHeader
        title={ticket.ticketNumber}
        description={ticket.title}
        actions={
          <div className="flex flex-wrap gap-2">
            <TicketPriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        }
      />

      {actionError ? <p className="mb-4 text-sm text-destructive">{actionError}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{ticket.description}</CardContent>
          </Card>

          {ticket.attachments?.length ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Attachments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ticket.attachments.map((file) => (
                    <a
                      key={file.id}
                      href={mediaUrl(file.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border hover:bg-muted/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaUrl(file.url)}
                        alt={file.originalName}
                        className="h-40 w-full object-cover"
                      />
                      <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                        {file.originalName}
                      </p>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {ticket.resolutionSummary ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Resolution</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {ticket.resolutionSummary}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticket.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                ticket.comments.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-md border p-3 text-sm',
                      item.isInternal && 'border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{item.user?.displayName ?? 'User'}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                    </div>
                    {item.isInternal ? (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Internal note
                      </p>
                    ) : null}
                    <p className="mt-2 whitespace-pre-wrap">{item.message}</p>
                  </div>
                ))
              )}

              {canComment ? (
                <form className="space-y-2 border-t pt-3" onSubmit={submitComment}>
                  <Label htmlFor="comment">Add comment</Label>
                  <textarea
                    id="comment"
                    className={textareaClassName}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required
                  />
                  {canInternal ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                      />
                      Internal IT note (hidden from requester)
                    </label>
                  ) : null}
                  <Button type="submit" size="sm" disabled={saving || !comment.trim()}>
                    Post comment
                  </Button>
                </form>
              ) : (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  Only the ticket requester or IT staff can post comments.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ticket.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              ) : (
                ticket.history.map((item) => (
                  <div key={item.id} className="border-b py-2 text-sm last:border-0">
                    <p className="font-medium">
                      {HISTORY_ACTION_LABELS[item.action] ?? item.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)} · {item.user?.displayName ?? 'System'}
                      {item.oldValue || item.newValue
                        ? ` · ${item.oldValue ?? '—'} → ${item.newValue ?? '—'}`
                        : ''}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Category:</span> {ticket.category?.name}
              </p>
              <p>
                <span className="text-muted-foreground">Requester:</span>{' '}
                {ticket.requester?.displayName}
              </p>
              <p>
                <span className="text-muted-foreground">Assignee:</span>{' '}
                {ticket.assignee?.displayName ?? 'Unassigned'}
              </p>
              <p>
                <span className="text-muted-foreground">Created:</span>{' '}
                {formatDateTime(ticket.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Updated:</span>{' '}
                {formatDateTime(ticket.updatedAt)}
              </p>
              {ticket.resolvedAt ? (
                <p>
                  <span className="text-muted-foreground">Resolved:</span>{' '}
                  {formatDateTime(ticket.resolvedAt)}
                </p>
              ) : null}
              {ticket.closedAt ? (
                <p>
                  <span className="text-muted-foreground">Closed:</span>{' '}
                  {formatDateTime(ticket.closedAt)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {can('helpdesk.assign') ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <select
                  className={selectClassName}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {(lookups?.technicians ?? []).map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.displayName}
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={saving} onClick={() => void saveAssignee()}>
                  Save assignee
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {can('helpdesk.update') ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Priority</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <select
                  className={selectClassName}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ITTicketPriority)}
                >
                  {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value as ITTicketPriority]}
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={saving} onClick={() => void savePriority()}>
                  Save priority
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {(can('helpdesk.update') ||
            can('helpdesk.resolve') ||
            can('helpdesk.close') ||
            can('helpdesk.reopen')) && (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <select
                  className={selectClassName}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ITTicketStatus)}
                >
                  {(lookups?.statuses ?? Object.keys(STATUS_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value as ITTicketStatus]}
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={saving} onClick={() => void saveStatus()}>
                  Save status
                </Button>
                <div className="flex flex-wrap gap-2 pt-1">
                  {can('helpdesk.close') && ticket.status === 'RESOLVED' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => setConfirmAction('close')}
                    >
                      Close
                    </Button>
                  ) : null}
                  {can('helpdesk.reopen') &&
                  (ticket.status === 'RESOLVED' ||
                    ticket.status === 'CLOSED' ||
                    ticket.status === 'CANCELLED') ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => setConfirmAction('reopen')}
                    >
                      Reopen
                    </Button>
                  ) : null}
                  {(can('helpdesk.update') || isRequester) &&
                  !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(ticket.status) ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={saving}
                      onClick={() => setConfirmAction('cancel')}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}

          {can('helpdesk.resolve') &&
          !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status) ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Resolve</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-2" onSubmit={resolveTicket}>
                  <Label htmlFor="resolution">Resolution summary</Label>
                  <textarea
                    id="resolution"
                    className={textareaClassName}
                    value={resolutionSummary}
                    onChange={(e) => setResolutionSummary(e.target.value)}
                    required
                  />
                  <Button type="submit" size="sm" disabled={saving}>
                    Mark resolved
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {can('helpdesk.reopen') &&
          (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') &&
          isRequester &&
          !can('helpdesk.update') ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Reopen</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => setConfirmAction('reopen')}
                >
                  Reopen ticket
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction === 'close'
            ? 'Close ticket'
            : confirmAction === 'cancel'
              ? 'Cancel ticket'
              : 'Reopen ticket'
        }
        description={
          confirmAction === 'close'
            ? `Close ${ticket.ticketNumber}?`
            : confirmAction === 'cancel'
              ? `Cancel ${ticket.ticketNumber}? This cannot be undone without reopening.`
              : `Reopen ${ticket.ticketNumber}?`
        }
        loading={saving}
        error={actionError}
        onConfirm={onConfirm}
      />
    </div>
  );
}
