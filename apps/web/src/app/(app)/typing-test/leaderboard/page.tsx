'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TypingLeaderboardResponse, TypingTestMode, TypingTextCategory } from '@worknest/types';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { apiRequest, ApiClientError } from '@/lib/api';
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
import { TEXT_CATEGORY_LABELS, TIME_MODE_OPTIONS, WORD_MODE_OPTIONS } from '@/lib/typing-test/engine';

export default function TypingLeaderboardPage() {
  const { can, loading: authLoading } = useAuth();
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('all');
  const [mode, setMode] = useState<TypingTestMode | 'all'>('all');
  const [modeValue, setModeValue] = useState<number | 'all'>('all');
  const [category, setCategory] = useState<TypingTextCategory | 'all'>('all');
  const [data, setData] = useState<TypingLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!can('typing-tests.view')) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<TypingLeaderboardResponse>('/typing-tests/leaderboard', {
        query: {
          period,
          ...(mode !== 'all' ? { mode } : {}),
          ...(modeValue !== 'all' ? { modeValue } : {}),
          ...(category !== 'all' ? { textCategory: category } : {}),
          page: 1,
          pageSize: 50,
        },
      });
      setData(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [can, period, mode, modeValue, category]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!can('typing-tests.view')) {
    return (
      <p className="text-sm text-destructive">You do not have permission to view the leaderboard.</p>
    );
  }

  const modeValueOptions =
    mode === 'WORDS'
      ? WORD_MODE_OPTIONS
      : mode === 'TIME'
        ? TIME_MODE_OPTIONS
        : [...TIME_MODE_OPTIONS, ...WORD_MODE_OPTIONS.filter((w) => !TIME_MODE_OPTIONS.includes(w as never))];

  return (
    <>
      <PageHeader
        title="Typing Leaderboard"
        description="Ranked by WPM, then accuracy, then earliest result."
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

        <Select
          value={mode}
          onValueChange={(v) => {
            setMode((v ?? 'all') as typeof mode);
            setModeValue('all');
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="TIME">Time</SelectItem>
            <SelectItem value="WORDS">Words</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={modeValue === 'all' ? 'all' : String(modeValue)}
          onValueChange={(v) => setModeValue(v === 'all' ? 'all' : Number(v))}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {modeValueOptions.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category}
          onValueChange={(v) => setCategory((v ?? 'all') as typeof category)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(Object.keys(TEXT_CATEGORY_LABELS) as TypingTextCategory[]).map((cat) => (
              <SelectItem key={cat} value={cat}>
                {TEXT_CATEGORY_LABELS[cat]}
              </SelectItem>
            ))}
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
              <TableHead>WPM</TableHead>
              <TableHead>Accuracy</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.length ? (
              data.items.map((row) => (
                <TableRow key={`${row.userId}-${row.createdAt}-${row.rank}`}>
                  <TableCell className="font-mono">{row.rank}</TableCell>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell className="font-mono">{Math.round(row.wpm)}</TableCell>
                  <TableCell>{Math.round(row.accuracy)}%</TableCell>
                  <TableCell>
                    {row.mode === 'TIME' ? `${row.modeValue}s` : `${row.modeValue} words`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No results yet. Be the first to take a test!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </>
  );
}
