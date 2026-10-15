'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/helpdesk/badges';
import { PageHeader } from '@/components/page-header';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatDateTime,
  previewText,
  type HelpdeskDashboard,
  type ITTicketPriority,
  type ITTicketStatus,
} from '@/lib/helpdesk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function HelpdeskDashboardPage() {
  const { can } = useAuth();
  const [data, setData] = useState<HelpdeskDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can('helpdesk.view')) {
      setError('You do not have permission to view Helpdesk.');
      return;
    }
    void (async () => {
      try {
        setData(await apiRequest<HelpdeskDashboard>('/helpdesk/dashboard'));
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load dashboard');
      }
    })();
  }, [can]);

  const cards = [
    { label: 'Open', value: data?.open },
    { label: 'Unassigned', value: data?.unassigned },
    { label: 'In progress', value: data?.inProgress },
    { label: 'Resolved', value: data?.resolved },
  ];

  return (
    <div>
      <PageHeader
        title="Helpdesk Dashboard"
        description="Overview of IT support tickets in your scope."
        actions={
          can('helpdesk.create') ? (
            <Button size="sm" asChild>
              <Link href="/helpdesk/my-tickets">New ticket</Link>
            </Button>
          ) : undefined
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="shadow-none">
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {data ? card.value : <Skeleton className="h-7 w-12" />}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">By status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data ? <Skeleton className="h-24 w-full" /> : null}
            {data
              ? (Object.keys(STATUS_LABELS) as ITTicketStatus[]).map((status) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span>{STATUS_LABELS[status]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {data.byStatus[status] ?? 0}
                    </span>
                  </div>
                ))
              : null}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">By priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data ? <Skeleton className="h-24 w-full" /> : null}
            {data
              ? (Object.keys(PRIORITY_LABELS) as ITTicketPriority[]).map((priority) => (
                  <div key={priority} className="flex items-center justify-between text-sm">
                    <span>{PRIORITY_LABELS[priority]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {data.byPriority[priority] ?? 0}
                    </span>
                  </div>
                ))
              : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent tickets</CardTitle>
          <div className="flex gap-2">
            {can('helpdesk.view_all') ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/helpdesk/tickets">All tickets</Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/helpdesk/my-tickets">My tickets</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? <Skeleton className="h-24 w-full" /> : null}
          {data?.recentTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          ) : null}
          {data?.recentTickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/helpdesk/tickets/${ticket.id}`}
              className="block rounded-lg border p-3 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  <span className="mono text-xs text-muted-foreground">{ticket.ticketNumber}</span>{' '}
                  {previewText(ticket.title, 60)}
                </p>
                <div className="flex items-center gap-2">
                  <TicketPriorityBadge priority={ticket.priority} />
                  <TicketStatusBadge status={ticket.status} />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(ticket.createdAt)} · {ticket.category?.name} ·{' '}
                {ticket.requester?.displayName}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
