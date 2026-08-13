'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { NumberMemoryLeaderboardResponse } from '@worknest/types';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { apiRequest, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export default function NumberMemoryLeaderboardPage() {
  const { can, loading: authLoading } = useAuth();
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('all');
  const [data, setData] = useState<NumberMemoryLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!can('number-memory.view')) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<NumberMemoryLeaderboardResponse>('/number-memory/leaderboard', {
        query: { period, page: 1, pageSize: 50 },
      });
      setData(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [can, period]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!can('number-memory.view')) {
    return (
      <p className="text-sm text-destructive">You do not have permission to view the leaderboard.</p>
    );
  }

  return (
    <>
      <PageHeader
        title="Number Memory Leaderboard"
        description="Ranked by each player's highest digit count."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/number-memory">Play</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={period} onValueChange={(v) => setPeriod((v ?? 'all') as typeof period)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data?.myRank ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Your rank: <span className="font-medium text-foreground">#{data.myRank}</span>
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Digits</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.length ? (
              data.items.map((row) => (
                <TableRow key={`${row.userId}-${row.createdAt}-${row.rank}`}>
                  <TableCell className="font-mono">{row.rank}</TableCell>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell className="font-mono">{row.maxDigits}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No results yet. Be the first to play!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </>
  );
}
