'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/components/auth-provider';
import { InteractionFormDialog } from '@/components/crm/interaction-form-dialog';
import {
  CaseStatusBadge,
  FollowUpStatusBadge,
  InteractionStatusBadge,
  PriorityBadge,
} from '@/components/crm/badges';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  INTERACTION_TYPE_LABELS,
  STORE_LABELS,
  STORE_OPTIONS,
  customerTitle,
  formatDateTime,
  previewText,
  selectClassName,
  storeLabel,
  type CrmCustomerDetail,
  type CrmCustomerRow,
  type CrmLookups,
} from '@/lib/crm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function CrmCustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const [customer, setCustomer] = useState<CrmCustomerDetail | null>(null);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, lookupData] = await Promise.all([
        apiRequest<CrmCustomerDetail>(`/crm/customers/${params.id}`),
        apiRequest<CrmLookups>('/crm/lookups'),
      ]);
      setCustomer(detail);
      setLookups(lookupData);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div>
        <p className="text-sm text-destructive">{error ?? 'Customer not found'}</p>
        <Button className="mt-3" variant="outline" onClick={() => router.push('/crm/customers')}>
          Back to customers
        </Button>
      </div>
    );
  }

  const preset = customer as CrmCustomerRow;
  const filteredActivity = customer.activity.filter((item) => {
    if (!storeFilter && !orderFilter.trim()) return true;
    if (item.type !== 'interaction') return false;
    if (storeFilter && item.store !== storeFilter) return false;
    if (orderFilter.trim()) {
      const q = orderFilter.trim().toLowerCase();
      if (!(item.orderNumber ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title={customerTitle(customer)}
        description={customer.code}
        actions={
          can('crm.create') ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              Add interaction
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Customer information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Customer name: </span>
                {customer.name}
              </p>
              <p>
                <span className="text-muted-foreground">Phone: </span>
                {customer.phone || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Email: </span>
                {customer.email || '—'}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Address: </span>
                {customer.address || '—'}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Customer activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="storeFilter">Store</Label>
                  <select
                    id="storeFilter"
                    className={selectClassName}
                    value={storeFilter}
                    onChange={(e) => setStoreFilter(e.target.value)}
                  >
                    <option value="">All stores</option>
                    {STORE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {STORE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orderFilter">Order number</Label>
                  <Input
                    id="orderFilter"
                    value={orderFilter}
                    onChange={(e) => setOrderFilter(e.target.value)}
                    placeholder="Filter by order…"
                  />
                </div>
              </div>
              {filteredActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No CRM activity yet.</p>
              ) : (
                <ol className="space-y-4">
                  {filteredActivity.map((item) => {
                    const href =
                      item.type === 'interaction'
                        ? `/crm/interactions/${item.hrefId}`
                        : item.type === 'case'
                          ? `/crm/cases/${item.hrefId}`
                          : '/crm/follow-ups';
                    return (
                      <li key={`${item.type}-${item.id}`} className="relative border-l pl-4">
                        <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-foreground" />
                        <Link href={href} className="block hover:underline">
                          <p className="text-xs text-muted-foreground">{formatDateTime(item.date)}</p>
                          <p className="text-sm font-medium">
                            {item.agent?.displayName ?? 'Unassigned'} · {item.title}
                          </p>
                          {item.type === 'interaction' ? (
                            <p className="text-xs text-muted-foreground">
                              {storeLabel(item.store, item.storeOther)}
                              {item.orderNumber ? ` · Order ${item.orderNumber}` : ''}
                            </p>
                          ) : null}
                          <p className="text-sm text-muted-foreground">
                            {previewText(item.subtitle, 100)}
                          </p>
                        </Link>
                        <div className="mt-1">
                          {item.type === 'interaction' ? (
                            <InteractionStatusBadge status={item.status} />
                          ) : item.type === 'case' ? (
                            <CaseStatusBadge status={item.status} />
                          ) : (
                            <FollowUpStatusBadge status={item.status} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">CRM activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Interactions:{' '}
                <span className="font-medium tabular-nums">{customer.interactionCount}</span>
              </p>
              <p>
                Cases: <span className="font-medium tabular-nums">{customer.caseCount}</span>
              </p>
              <p>
                Follow-ups:{' '}
                <span className="font-medium tabular-nums">{customer.followUpCount}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Open cases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {customer.cases.filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS')
                .length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                customer.cases
                  .filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS')
                  .map((crmCase) => (
                    <Link
                      key={crmCase.id}
                      href={`/crm/cases/${crmCase.id}`}
                      className="block rounded-md border p-2 hover:bg-muted/40"
                    >
                      <p className="text-sm font-medium">{crmCase.subject}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="mono text-xs">{crmCase.caseNumber}</span>
                        <PriorityBadge priority={crmCase.priority} />
                      </div>
                    </Link>
                  ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <InteractionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        presetCustomer={preset}
        onSaved={() => void load()}
      />
    </div>
  );
}
