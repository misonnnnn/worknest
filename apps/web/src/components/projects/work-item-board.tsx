'use client';

import Link from 'next/link';
import { apiRequest, ApiClientError } from '@/lib/api';
import type { CatalogStatus, WorkItemRow } from '@/lib/projects';
import { priorityLabel } from '@/lib/projects';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function priorityVariant(priority: string) {
  if (priority === 'URGENT' || priority === 'HIGH') return 'destructive' as const;
  if (priority === 'MEDIUM') return 'secondary' as const;
  return 'outline' as const;
}

export function WorkItemBoard({
  items,
  statuses,
  canChangeStatus,
  onStatusChanged,
}: {
  items: WorkItemRow[];
  statuses: CatalogStatus[];
  canChangeStatus: boolean;
  onStatusChanged: (item: WorkItemRow) => void;
}) {
  async function changeStatus(item: WorkItemRow, statusId: string) {
    if (statusId === item.status.id) return;
    try {
      const updated = await apiRequest<WorkItemRow>(`/work-items/${item.id}`, {
        method: 'PATCH',
        body: { statusId },
      });
      onStatusChanged(updated);
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : 'Failed to update status');
    }
  }

  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-5">
      {statuses.map((status) => {
        const columnItems = items.filter((item) => item.status.id === status.id);
        return (
          <div key={status.id} className="min-w-56 rounded-xl bg-muted/40 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-xs font-medium">{status.name}</p>
              <span className="text-xs text-muted-foreground">{columnItems.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {columnItems.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">No items</p>
              ) : null}
              {columnItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg bg-card p-2.5 shadow-none ring-1 ring-foreground/10"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Link
                      href={`/work-items/${item.id}`}
                      className="mono text-[11px] text-muted-foreground hover:underline"
                    >
                      {item.key}
                    </Link>
                    <Badge variant="outline" className="rounded-md font-normal">
                      {item.type.name}
                    </Badge>
                  </div>
                  <Link href={`/work-items/${item.id}`} className="text-sm font-medium hover:underline">
                    {item.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant={priorityVariant(item.priority)} className="rounded-md font-normal">
                      {priorityLabel(item.priority)}
                    </Badge>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {item.assignee?.displayName ?? 'Unassigned'}
                    </span>
                  </div>
                  {canChangeStatus ? (
                    <Select
                      value={item.status.id}
                      onValueChange={(value) => {
                        if (value) void changeStatus(item, value);
                      }}
                    >
                      <SelectTrigger className="mt-2 h-7 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
