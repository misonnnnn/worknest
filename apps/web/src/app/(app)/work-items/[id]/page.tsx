'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import type {
  ActivityLog,
  ProjectLookups,
  WorkItemComment,
  WorkItemRow,
} from '@/lib/projects';
import {
  activityLabel,
  formatDate,
  formatDateTime,
  NONE,
  PRIORITIES,
  priorityLabel,
  textareaClassName,
  userLine,
} from '@/lib/projects';
import type { PaginatedResult } from '@worknest/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkItemDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, can } = useAuth();
  const id = params.id;

  const [item, setItem] = useState<WorkItemRow | null>(null);
  const [lookups, setLookups] = useState<ProjectLookups | null>(null);
  const [comments, setComments] = useState<WorkItemComment[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState(NONE);
  const [dueDate, setDueDate] = useState('');

  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isManager = Boolean(user && item && item.project.projectManagerId === user.id);
  const canEdit = can('work-items.update') || can('projects.manage') || isManager;
  const canAssign = canEdit || can('work-items.assign');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workItem, lookupData, commentData] = await Promise.all([
        apiRequest<WorkItemRow>(`/work-items/${id}`),
        apiRequest<ProjectLookups>('/projects/lookups'),
        apiRequest<WorkItemComment[]>(`/work-items/${id}/comments`),
      ]);
      setItem(workItem);
      setLookups(lookupData);
      setComments(commentData);
      setTitle(workItem.title);
      setDescription(workItem.description ?? '');
      setTypeId(workItem.type.id);
      setStatusId(workItem.status.id);
      setPriority(workItem.priority);
      setAssigneeId(workItem.assignee?.id ?? NONE);
      setDueDate(workItem.dueDate?.slice(0, 10) ?? '');

      const activityData = await apiRequest<PaginatedResult<ActivityLog>>(
        `/projects/${workItem.project.id}/activity`,
        { query: { page: 1, pageSize: 50 } },
      );
      setActivity(activityData.items.filter((log) => log.workItem?.id === workItem.id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load work item');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const updated = await apiRequest<WorkItemRow>(`/work-items/${id}`, {
        method: 'PATCH',
        body: {
          title,
          description: description || null,
          typeId,
          statusId,
          priority,
          assigneeId: assigneeId === NONE ? null : assigneeId,
          dueDate: dueDate || null,
        },
      });
      setItem(updated);
      void load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save work item');
    } finally {
      setSaving(false);
    }
  }

  async function onAddComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentSaving(true);
    setCommentError(null);
    try {
      const comment = await apiRequest<WorkItemComment>(`/work-items/${id}/comments`, {
        method: 'POST',
        body: { comment: commentText.trim() },
      });
      setComments((prev) => [...prev, comment]);
      setCommentText('');
    } catch (err) {
      setCommentError(err instanceof ApiClientError ? err.message : 'Failed to add comment');
    } finally {
      setCommentSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/work-items/${id}`, { method: 'DELETE' });
      if (item) router.push(`/projects/${item.project.id}`);
      else router.push('/my-work-items');
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete work item');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return <p className="text-sm text-destructive">{error ?? 'Work item not found'}</p>;
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href={`/projects/${item.project.id}`} className="hover:underline">
          {item.project.name}
        </Link>
      </p>
      <PageHeader
        title={item.key}
        description={item.title}
        actions={
          can('work-items.delete') ? (
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSave}>
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
              <div className="space-y-1.5">
                <Label htmlFor="wi-title">Title</Label>
                <Input
                  id="wi-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-description">Description</Label>
                <textarea
                  id="wi-description"
                  className={textareaClassName}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={typeId} onValueChange={(value) => setTypeId(value ?? '')} disabled={!canEdit}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(lookups?.workItemTypes ?? []).map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={statusId}
                    onValueChange={(value) => setStatusId(value ?? '')}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(lookups?.workItemStatuses ?? []).map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          {status.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(value) =>
                      setPriority((value as (typeof PRIORITIES)[number]) ?? 'MEDIUM')
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {priorityLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Assignee</Label>
                  <Select
                    value={assigneeId}
                    onValueChange={(value) => setAssigneeId(value ?? NONE)}
                    disabled={!canAssign}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {(lookups?.users ?? []).map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {userLine(person)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wi-due">Due date</Label>
                  <Input
                    id="wi-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reporter</Label>
                  <Input value={userLine(item.reporter)} disabled />
                </div>
              </div>
              {canEdit || canAssign ? (
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="outline">{item.type.name}</Badge>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">{item.status.name}</Badge>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Priority</span>
                <span>{priorityLabel(item.priority)}</span>
              </div>
              <p className="text-muted-foreground">Due {formatDate(item.dueDate)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-xs text-muted-foreground">
                    {comment.user.displayName} · {formatDateTime(comment.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{comment.comment}</p>
                </div>
              ))
            )}
            <form className="space-y-2" onSubmit={onAddComment}>
              {commentError ? <p className="text-sm text-destructive">{commentError}</p> : null}
              <textarea
                className={textareaClassName}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment"
              />
              <Button type="submit" size="sm" disabled={commentSaving || !commentText.trim()}>
                {commentSaving ? 'Posting…' : 'Comment'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              activity.map((log) => (
                <div key={log.id} className="text-sm">
                  <p>
                    <span className="font-medium">{log.user?.displayName ?? 'Someone'}</span>{' '}
                    {activityLabel(log.action)}
                    {log.oldValue || log.newValue ? (
                      <span className="text-muted-foreground">
                        {' '}
                        ({[log.oldValue, log.newValue].filter(Boolean).join(' → ')})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete work item"
        description={`Delete ${item.key}? This cannot be undone.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </div>
  );
}
