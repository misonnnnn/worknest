'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ResourceListPage } from '@/components/resource-list';
import { apiRequest } from '@/lib/api';
import type { CatalogStatus, ProjectLookups, WorkItemRow } from '@/lib/projects';
import { formatDate, priorityLabel } from '@/lib/projects';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

export default function MyWorkItemsPage() {
  const [statuses, setStatuses] = useState<CatalogStatus[]>([]);
  const [statusId, setStatusId] = useState(ALL);

  useEffect(() => {
    async function load() {
      try {
        const lookups = await apiRequest<ProjectLookups>('/projects/lookups');
        setStatuses(lookups.workItemStatuses);
      } catch {
        setStatuses([]);
      }
    }
    void load();
  }, []);

  const queryExtras = useMemo(
    () => ({ statusId: statusId === ALL ? undefined : statusId }),
    [statusId],
  );

  return (
    <ResourceListPage<WorkItemRow>
      title="My Work Items"
      description="Work items currently assigned to you."
      endpoint="/work-items/mine"
      permission="projects.view"
      queryExtras={queryExtras}
      filters={
        <Select value={statusId} onValueChange={(value) => setStatusId(value ?? ALL)}>
          <SelectTrigger className="h-8 w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      columns={[
        {
          key: 'key',
          header: 'Key',
          render: (item) => (
            <Link href={`/work-items/${item.id}`} className="mono text-xs hover:underline">
              {item.key}
            </Link>
          ),
        },
        {
          key: 'title',
          header: 'Title',
          render: (item) => (
            <Link href={`/work-items/${item.id}`} className="font-medium hover:underline">
              {item.title}
            </Link>
          ),
        },
        {
          key: 'project',
          header: 'Project',
          render: (item) => (
            <Link href={`/projects/${item.project.id}`} className="hover:underline">
              {item.project.name}
            </Link>
          ),
        },
        {
          key: 'type',
          header: 'Type',
          render: (item) => (
            <Badge variant="outline" className="rounded-md font-normal">
              {item.type.name}
            </Badge>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => (
            <Badge variant="secondary" className="rounded-md font-normal">
              {item.status.name}
            </Badge>
          ),
        },
        {
          key: 'priority',
          header: 'Priority',
          render: (item) => priorityLabel(item.priority),
        },
        {
          key: 'due',
          header: 'Due',
          render: (item) => formatDate(item.dueDate),
        },
      ]}
    />
  );
}
