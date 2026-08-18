'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { FollowUpStatusBadge, InteractionStatusBadge } from '@/components/crm/badges';
import { PageHeader } from '@/components/page-header';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  INTERACTION_TYPE_LABELS,
  customerTitle,
  formatDateTime,
  previewText,
  type CrmDashboard,
} from '@/lib/crm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function CrmDashboardPage() {
  const { can } = useAuth();
  const [data, setData] = useState<CrmDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can('crm.view')) {
      setError('You do not have permission to view CRM.');
      return;
    }
    void (async () => {
      try {
        setData(await apiRequest<CrmDashboard>('/crm/dashboard'));
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to load dashboard');
      }
    })();
  }, [can]);

  const cards = [
    { label: "Today's Interactions", value: data?.todayInteractions },
    { label: 'Open Cases', value: data?.openCases },
    { label: 'Pending Follow-ups', value: data?.pendingFollowUps },
    { label: 'Resolved Today', value: data?.resolvedToday },
  ];

  return (
    <div>
      <PageHeader
        title="CRM Dashboard"
        description="A quick view of today’s customer service work."
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
            <CardTitle className="text-sm">Recent interactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data ? <Skeleton className="h-24 w-full" /> : null}
            {data?.recentInteractions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interactions yet.</p>
            ) : null}
            {data?.recentInteractions.map((item) => (
              <Link
                key={item.id}
                href={`/crm/interactions/${item.id}`}
                className="block rounded-lg border p-3 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{customerTitle(item.customer)}</p>
                  <InteractionStatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(item.interactionDate)} ·{' '}
                  {INTERACTION_TYPE_LABELS[item.interactionType]} · {item.agent?.displayName}
                </p>
                <p className="mt-1 text-sm">{previewText(item.inquiry, 90)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Pending follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data ? <Skeleton className="h-24 w-full" /> : null}
            {data?.pendingFollowUpItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending follow-ups.</p>
            ) : null}
            {data?.pendingFollowUpItems.map((item) => (
              <Link
                key={item.id}
                href="/crm/follow-ups"
                className="block rounded-lg border p-3 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{customerTitle(item.customer)}</p>
                  <FollowUpStatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(item.followUpDate)} · {item.assignedTo?.displayName}
                </p>
                <p className="mt-1 text-sm">{previewText(item.notes, 90)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
