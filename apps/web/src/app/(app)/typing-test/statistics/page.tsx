'use client';

import { useEffect, useState } from 'react';
import type { TypingMyStats } from '@worknest/types';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { apiRequest, ApiClientError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function TypingStatisticsPage() {
  const { can, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<TypingMyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can('typing-tests.view')) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const result = await apiRequest<TypingMyStats>('/typing-tests/my-stats');
        setStats(result);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [can]);

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!can('typing-tests.view')) {
    return (
      <p className="text-sm text-destructive">You do not have permission to view statistics.</p>
    );
  }

  const maxWpm = Math.max(...(stats?.wpmHistory.map((h) => h.wpm) ?? [1]), 1);

  return (
    <>
      <PageHeader
        title="My Typing Statistics"
        description="Your personal typing test history and averages."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/typing-test">Take a test</Link>
          </Button>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Best WPM" value={Math.round(stats.bestWpm).toString()} />
            <StatCard title="Average WPM" value={Math.round(stats.averageWpm).toString()} />
            <StatCard title="Best accuracy" value={`${Math.round(stats.bestAccuracy)}%`} />
            <StatCard title="Average accuracy" value={`${Math.round(stats.averageAccuracy)}%`} />
            <StatCard title="Total tests" value={String(stats.totalTests)} />
            <StatCard
              title="Total typing time"
              value={`${Math.round(stats.totalTypingTimeSeconds / 60)} min`}
            />
          </div>

          {stats.wpmHistory.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">WPM history (last {stats.wpmHistory.length} tests)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-32 items-end gap-1">
                  {stats.wpmHistory.map((point, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-primary/70"
                        style={{ height: `${(point.wpm / maxWpm) * 100}%`, minHeight: 4 }}
                        title={`${point.wpm} WPM on ${point.date}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent tests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stats.recentTests.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>WPM</TableHead>
                      <TableHead>Accuracy</TableHead>
                      <TableHead>Mode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentTests.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{new Date(t.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="font-mono">{Math.round(t.wpm)}</TableCell>
                        <TableCell>{Math.round(t.accuracy)}%</TableCell>
                        <TableCell>
                          {t.mode === 'TIME' ? `${t.modeValue}s` : `${t.modeValue} words`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">No tests yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-3xl font-medium tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
