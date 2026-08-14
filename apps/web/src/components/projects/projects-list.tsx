'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import type { ProjectLookups, ProjectRow } from '@/lib/projects';
import { formatDate } from '@/lib/projects';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

export function ProjectsList({
  title,
  description,
  endpoint,
}: {
  title: string;
  description: string;
  endpoint: string;
}) {
  const { can } = useAuth();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [lookups, setLookups] = useState<ProjectLookups | null>(null);
  const [statusId, setStatusId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadLookups() {
      try {
        setLookups(await apiRequest<ProjectLookups>('/projects/lookups'));
      } catch {
        setLookups(null);
      }
    }
    void loadLookups();
  }, []);

  const queryExtras = useMemo(
    () => ({
      statusId: statusId === ALL ? undefined : statusId,
      departmentId: departmentId === ALL ? undefined : departmentId,
    }),
    [statusId, departmentId],
  );

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/projects/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ResourceListPage<ProjectRow>
        key={reloadKey}
        title={title}
        description={description}
        endpoint={endpoint}
        permission="projects.view"
        canCreate={can('projects.create')}
        createLabel="New project"
        onCreate={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        queryExtras={queryExtras}
        filters={
          <>
            <Select
              value={statusId}
              onValueChange={(value) => {
                setStatusId(value ?? ALL);
              }}
            >
              <SelectTrigger className="h-8 w-full sm:w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(lookups?.projectStatuses ?? []).map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={departmentId}
              onValueChange={(value) => {
                setDepartmentId(value ?? ALL);
              }}
            >
              <SelectTrigger className="h-8 w-full sm:w-44">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {(lookups?.departments ?? []).map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        columns={[
          {
            key: 'name',
            header: 'Project',
            render: (project) => (
              <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                {project.name}
                <span className="ml-2 mono text-xs text-muted-foreground">{project.key}</span>
              </Link>
            ),
          },
          {
            key: 'department',
            header: 'Department',
            render: (project) => project.department?.name ?? '—',
          },
          {
            key: 'manager',
            header: 'Project manager',
            render: (project) => project.projectManager.displayName,
          },
          {
            key: 'status',
            header: 'Status',
            render: (project) => (
              <Badge variant="secondary" className="rounded-md font-normal">
                {project.status.name}
              </Badge>
            ),
          },
          {
            key: 'dates',
            header: 'Dates',
            render: (project) => (
              <span className="text-xs text-muted-foreground">
                {formatDate(project.startDate)} → {formatDate(project.endDate)}
              </span>
            ),
          },
          {
            key: 'progress',
            header: 'Progress',
            render: (project) => (
              <div className="min-w-24">
                <div className="mb-1 text-xs tabular-nums">{project.progress.percent}%</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${project.progress.percent}%` }}
                  />
                </div>
              </div>
            ),
          },
        ]}
        actions={(project) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => router.push(`/projects/${project.id}`) },
              ...(can('projects.update')
                ? [
                    {
                      label: 'Edit',
                      onClick: () => {
                        setEditing(project);
                        setFormOpen(true);
                      },
                    },
                  ]
                : []),
              ...(can('projects.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(project);
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        editing={editing}
        onSaved={(project) => {
          refresh();
          if (!editing) router.push(`/projects/${project.id}`);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete project"
        description={`Delete project "${deleteTarget?.name ?? ''}"? Work items, comments, and activity will also be deleted.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
