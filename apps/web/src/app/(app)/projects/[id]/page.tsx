'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import { WorkItemFormDialog } from '@/components/projects/work-item-form-dialog';
import { WorkItemBoard } from '@/components/projects/work-item-board';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import type {
  ActivityLog,
  ProjectDetail,
  ProjectLookups,
  ProjectMember,
  WorkItemRow,
} from '@/lib/projects';
import {
  activityLabel,
  formatDate,
  formatDateTime,
  MEMBER_ROLES,
  memberRoleLabel,
  userLine,
} from '@/lib/projects';
import type { PaginatedResult } from '@worknest/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type TabId = 'overview' | 'work-items' | 'members' | 'activity';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'work-items', label: 'Work Items' },
  { id: 'members', label: 'Members' },
  { id: 'activity', label: 'Activity' },
];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, can } = useAuth();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [lookups, setLookups] = useState<ProjectLookups | null>(null);
  const [items, setItems] = useState<WorkItemRow[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<(typeof MEMBER_ROLES)[number]>('MEMBER');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSaving, setMemberSaving] = useState(false);

  const isManager = Boolean(user && project && project.projectManager.id === user.id);
  const canManage = can('projects.manage') || isManager;
  const canEditItem = can('work-items.update') || isManager;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectData, lookupData, itemData, activityData] = await Promise.all([
        apiRequest<ProjectDetail>(`/projects/${projectId}`),
        apiRequest<ProjectLookups>('/projects/lookups'),
        apiRequest<{ items: WorkItemRow[] }>(`/projects/${projectId}/work-items`),
        apiRequest<PaginatedResult<ActivityLog>>(`/projects/${projectId}/activity`, {
          query: { page: 1, pageSize: 50 },
        }),
      ]);
      setProject(projectData);
      setLookups(lookupData);
      setItems(itemData.items);
      setActivity(activityData.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
      router.push('/projects');
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  }

  async function onAddMember(e: FormEvent) {
    e.preventDefault();
    if (!memberUserId) return;
    setMemberSaving(true);
    setMemberError(null);
    try {
      const member = await apiRequest<ProjectMember>(`/projects/${projectId}/members`, {
        method: 'POST',
        body: { userId: memberUserId, role: memberRole },
      });
      setProject((prev) => (prev ? { ...prev, members: [...prev.members, member] } : prev));
      setMemberUserId('');
      void load();
    } catch (err) {
      setMemberError(err instanceof ApiClientError ? err.message : 'Failed to add member');
    } finally {
      setMemberSaving(false);
    }
  }

  async function onRemoveMember(userId: string) {
    try {
      await apiRequest(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setMemberError(err instanceof ApiClientError ? err.message : 'Failed to remove member');
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

  if (error || !project) {
    return <p className="text-sm text-destructive">{error ?? 'Project not found'}</p>;
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`${project.key} · Created by ${project.createdBy.displayName}`}
        actions={
          <>
            {can('work-items.create') ? (
              <Button size="sm" onClick={() => setReportOpen(true)}>
                Report issue
              </Button>
            ) : null}
            {can('projects.update') || canManage ? (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            ) : null}
            {can('projects.delete') ? (
              <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{project.status.name}</Badge>
        <span className="text-muted-foreground">
          Manager: {userLine(project.projectManager)}
        </span>
        <span className="text-muted-foreground">
          Department: {project.department?.name ?? '—'}
        </span>
        <span className="text-muted-foreground">
          {formatDate(project.startDate)} → {formatDate(project.endDate)}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-3 py-2 text-sm ${
              tab === item.id
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="shadow-none lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {project.description || 'No description'}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{project.progress.percent}%</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {project.progress.completed} of {project.progress.total} work items completed
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${project.progress.percent}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'work-items' ? (
        <WorkItemBoard
          items={items}
          statuses={lookups?.workItemStatuses ?? []}
          canChangeStatus={canEditItem}
          onStatusChanged={() => void load()}
        />
      ) : null}

      {tab === 'members' ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Project members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              People can report issues without becoming members.
            </p>
            {canManage ? (
              <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onAddMember}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label>User</Label>
                  <Select value={memberUserId} onValueChange={(value) => setMemberUserId(value ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {(lookups?.users ?? [])
                        .filter((person) => !project.members.some((m) => m.user.id === person.id))
                        .map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {userLine(person)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full space-y-1.5 sm:w-44">
                  <Label>Role</Label>
                  <Select
                    value={memberRole}
                    onValueChange={(value) =>
                      setMemberRole((value as (typeof MEMBER_ROLES)[number]) ?? 'MEMBER')
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMBER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {memberRoleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={memberSaving || !memberUserId}>
                  {memberSaving ? 'Adding…' : 'Add'}
                </Button>
              </form>
            ) : null}
            {memberError ? <p className="text-sm text-destructive">{memberError}</p> : null}
            <div className="divide-y">
              {project.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{userLine(member.user)}</p>
                    <p className="text-xs text-muted-foreground">{memberRoleLabel(member.role)}</p>
                  </div>
                  {canManage && member.user.id !== project.projectManager.id ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void onRemoveMember(member.user.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'activity' ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {activity.map((log) => (
                  <div key={log.id} className="text-sm">
                    <p>
                      <span className="font-medium">{log.user?.displayName ?? 'Someone'}</span>{' '}
                      {activityLabel(log.action)}
                      {log.workItem ? (
                        <>
                          {' '}
                          <Link href={`/work-items/${log.workItem.id}`} className="hover:underline">
                            {log.workItem.key}
                          </Link>
                        </>
                      ) : null}
                      {log.oldValue || log.newValue ? (
                        <span className="text-muted-foreground">
                          {' '}
                          ({[log.oldValue, log.newValue].filter(Boolean).join(' → ')})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        lookups={lookups}
        editing={project}
        onSaved={() => void load()}
      />
      <WorkItemFormDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projectId={project.id}
        lookups={lookups}
        onSaved={() => {
          setTab('work-items');
          void load();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project"
        description={`Delete project "${project.name}"? This also deletes work items and comments.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </div>
  );
}
