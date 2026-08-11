'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
import { apiRequest, ApiClientError } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ResourceListProps<T> = {
  title: string;
  description: string;
  endpoint: string;
  permission: string;
  columns: Array<{
    key: string;
    header: string;
    render: (item: T) => React.ReactNode;
  }>;
  createLabel?: string;
  onCreate?: () => void;
  canCreate?: boolean;
  filters?: React.ReactNode;
  queryExtras?: Record<string, string | number | boolean | undefined>;
  actions?: (item: T) => React.ReactNode;
  pageSize?: number;
};

export function ResourceListPage<T extends { id: string }>({
  title,
  description,
  endpoint,
  permission,
  columns,
  createLabel,
  onCreate,
  canCreate,
  filters,
  queryExtras,
  actions,
  pageSize = 10,
}: ResourceListProps<T>) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!can(permission)) {
      setError('You do not have permission to view this module.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<PaginatedResult<T>>(endpoint, {
        query: { page, pageSize, search, ...queryExtras },
      });
      setData(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [can, permission, endpoint, page, pageSize, search, queryExtras]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          canCreate && onCreate ? (
            <Button size="sm" onClick={onCreate}>
              {createLabel ?? 'Create'}
            </Button>
          ) : undefined
        }
      />

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="h-8 sm:max-w-xs"
          />
          {filters}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>

        {error ? (
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        ) : null}

        {loading ? (
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        ) : null}

        {!loading && !error && data && data.items.length === 0 ? (
          <CardContent className="px-4 py-12 text-center">
            <p className="text-sm font-medium">No {title.toLowerCase()}</p>
            <p className="mt-1 text-sm text-muted-foreground">Nothing to show yet.</p>
          </CardContent>
        ) : null}

        {!loading && !error && data && data.items.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableHead key={col.key} className="h-9 text-xs font-medium">
                      {col.header}
                    </TableHead>
                  ))}
                  {actions ? (
                    <TableHead className="h-9 w-[1%] text-right text-xs font-medium">
                      Actions
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item: T) => (
                  <TableRow key={item.id}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="py-2.5 text-sm">
                        {col.render(item)}
                      </TableCell>
                    ))}
                    {actions ? (
                      <TableCell className="py-2.5 text-right">{actions(item)}</TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-3 py-2.5 text-xs text-muted-foreground">
              <div>
                Page {data.page} of {data.totalPages} · {data.total} total
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'secondary' : 'outline'} className="rounded-md font-normal">
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}
