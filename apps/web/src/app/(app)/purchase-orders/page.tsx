'use client';

import { FormEvent, useState } from 'react';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PoStatus = 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

type PoRow = {
  id: string;
  number: string;
  status: PoStatus;
  orderDate: string;
  lineCount: number;
  supplier: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
};

type PoLine = {
  id: string;
  quantity: number;
  unitPrice: string | number;
  receivedQty: number;
  product: { id: string; sku: string; name: string; unit: string };
};

type PoDetail = PoRow & {
  notes: string | null;
  lines: PoLine[];
};

function statusBadge(status: PoStatus) {
  const variant =
    status === 'RECEIVED'
      ? 'default'
      : status === 'CANCELLED'
        ? 'destructive'
        : status === 'DRAFT'
          ? 'secondary'
          : 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}

export default function PurchaseOrdersPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const [viewPo, setViewPo] = useState<PoDetail | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);

  const [actionTarget, setActionTarget] = useState<{
    po: PoRow;
    action: 'submit' | 'cancel';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  async function openView(po: PoRow) {
    try {
      const detail = await apiRequest<PoDetail>(`/purchase-orders/${po.id}`);
      setViewPo(detail);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to load purchase order');
    }
  }

  async function openReceive(po: PoRow) {
    try {
      const detail = await apiRequest<PoDetail>(`/purchase-orders/${po.id}`);
      const qty: Record<string, string> = {};
      for (const line of detail.lines) {
        const remaining = line.quantity - line.receivedQty;
        qty[line.id] = remaining > 0 ? String(remaining) : '0';
      }
      setViewPo(detail);
      setReceiveQty(qty);
      setReceiveError(null);
      setReceiveOpen(true);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to load purchase order');
    }
  }

  async function onReceive(e: FormEvent) {
    e.preventDefault();
    if (!viewPo) return;
    setReceiving(true);
    setReceiveError(null);
    try {
      const payload = Object.entries(receiveQty)
        .map(([lineId, quantity]) => ({ lineId, quantity: Number(quantity) }))
        .filter((line) => line.quantity > 0);

      if (payload.length === 0) {
        setReceiveError('Enter at least one quantity to receive');
        setReceiving(false);
        return;
      }

      await apiRequest(`/purchase-orders/${viewPo.id}/receive`, {
        method: 'POST',
        body: { lines: payload },
      });
      setReceiveOpen(false);
      setViewPo(null);
      refresh();
    } catch (err) {
      setReceiveError(err instanceof ApiClientError ? err.message : 'Failed to receive goods');
    } finally {
      setReceiving(false);
    }
  }

  async function onConfirmAction() {
    if (!actionTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const path =
        actionTarget.action === 'submit'
          ? `/purchase-orders/${actionTarget.po.id}/submit`
          : `/purchase-orders/${actionTarget.po.id}/cancel`;
      await apiRequest(path, { method: 'POST' });
      setActionTarget(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <ResourceListPage<PoRow>
        key={reloadKey}
        title="Purchase orders"
        description="Orders to suppliers. Create them by converting an approved requisition."
        endpoint="/purchase-orders"
        permission="purchasing.view"
        columns={[
          {
            key: 'number',
            header: 'Number',
            render: (po) => <span className="mono text-xs">{po.number}</span>,
          },
          { key: 'supplier', header: 'Supplier', render: (po) => po.supplier.name },
          { key: 'warehouse', header: 'Warehouse', render: (po) => po.warehouse.code },
          {
            key: 'date',
            header: 'Order date',
            render: (po) => new Date(po.orderDate).toLocaleDateString(),
          },
          { key: 'lines', header: 'Lines', render: (po) => po.lineCount },
          { key: 'status', header: 'Status', render: (po) => statusBadge(po.status) },
        ]}
        actions={(po) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => void openView(po) },
              ...(can('purchasing.update') && po.status === 'DRAFT'
                ? [
                    {
                      label: 'Submit',
                      onClick: () => {
                        setActionError(null);
                        setActionTarget({ po, action: 'submit' });
                      },
                    },
                  ]
                : []),
              ...(can('purchasing.receive') &&
              (po.status === 'ORDERED' || po.status === 'PARTIAL')
                ? [{ label: 'Receive', onClick: () => void openReceive(po) }]
                : []),
              ...(can('purchasing.update') &&
              po.status !== 'RECEIVED' &&
              po.status !== 'CANCELLED'
                ? [
                    {
                      label: 'Cancel',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setActionError(null);
                        setActionTarget({ po, action: 'cancel' });
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />

      <Dialog open={Boolean(viewPo) && !receiveOpen} onOpenChange={(open) => !open && setViewPo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewPo?.number ?? 'Purchase order'}</DialogTitle>
          </DialogHeader>
          {viewPo ? (
            <div className="space-y-3 text-sm">
              <p>
                Status: {statusBadge(viewPo.status)} · Supplier: {viewPo.supplier.name} · Warehouse:{' '}
                {viewPo.warehouse.code}
              </p>
              <div className="space-y-1">
                {viewPo.lines.map((line) => (
                  <div key={line.id} className="rounded border px-3 py-2">
                    <div className="font-medium">
                      {line.product.sku} — {line.product.name}
                    </div>
                    <div className="text-muted-foreground">
                      Ordered {line.quantity} · Received {line.receivedQty} · Unit price{' '}
                      {String(line.unitPrice)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Receive goods — {viewPo?.number}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onReceive}>
            {receiveError ? <p className="text-sm text-destructive">{receiveError}</p> : null}
            {viewPo?.lines.map((line) => {
              const remaining = line.quantity - line.receivedQty;
              return (
                <div key={line.id} className="space-y-1.5 rounded border p-3">
                  <Label>
                    {line.product.sku} — {line.product.name} (remaining {remaining})
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    value={receiveQty[line.id] ?? '0'}
                    onChange={(e) =>
                      setReceiveQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                    disabled={remaining <= 0}
                  />
                </div>
              );
            })}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={receiving}>
                {receiving ? 'Receiving…' : 'Receive'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(actionTarget)}
        onOpenChange={(open) => {
          if (!open) setActionTarget(null);
        }}
        title={actionTarget?.action === 'submit' ? 'Submit purchase order' : 'Cancel purchase order'}
        description={
          actionTarget?.action === 'submit'
            ? `Submit ${actionTarget.po.number}? It will move from Draft to Ordered.`
            : `Cancel ${actionTarget?.po.number ?? ''}?`
        }
        confirmLabel={actionTarget?.action === 'submit' ? 'Submit' : 'Cancel order'}
        confirmVariant={actionTarget?.action === 'submit' ? 'default' : 'destructive'}
        loading={actionLoading}
        error={actionError}
        onConfirm={onConfirmAction}
      />
    </>
  );
}
