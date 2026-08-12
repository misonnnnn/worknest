'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PrStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'CONVERTED';

type PrRow = {
  id: string;
  number: string;
  status: PrStatus;
  lineCount: number;
  notes: string | null;
  requestedBy: { id: string; email: string };
  department: { id: string; code: string; name: string } | null;
};

type PrLine = {
  id: string;
  quantity: number;
  notes: string | null;
  product: { id: string; sku: string; name: string; unit: string };
};

type PrDetail = PrRow & {
  rejectReason: string | null;
  approvedBy: { id: string; email: string } | null;
  lines: PrLine[];
  purchaseOrders: Array<{ id: string; number: string; status: string }>;
};

type Option = { id: string; label: string };

type DraftLine = {
  productId: string;
  quantity: string;
};

function statusBadge(status: PrStatus) {
  const variant =
    status === 'APPROVED' || status === 'CONVERTED'
      ? 'default'
      : status === 'REJECTED' || status === 'CANCELLED'
        ? 'destructive'
        : status === 'DRAFT'
          ? 'secondary'
          : 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}

export default function PurchaseRequisitionsPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const [products, setProducts] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '1' }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [viewPr, setViewPr] = useState<PrDetail | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PrRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertPr, setConvertPr] = useState<PrDetail | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({});
  const [convertError, setConvertError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const [actionTarget, setActionTarget] = useState<{
    pr: PrRow;
    action: 'submit' | 'approve' | 'cancel';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    async function loadOptions() {
      try {
        const [productResult, deptResult, supplierResult, warehouseResult] = await Promise.all([
          apiRequest<PaginatedResult<{ id: string; sku: string; name: string }>>('/products', {
            query: { page: 1, pageSize: 100 },
          }),
          apiRequest<PaginatedResult<{ id: string; code: string; name: string }>>('/departments', {
            query: { page: 1, pageSize: 100 },
          }),
          apiRequest<PaginatedResult<{ id: string; code: string; name: string }>>('/suppliers', {
            query: { page: 1, pageSize: 100 },
          }),
          apiRequest<PaginatedResult<{ id: string; code: string; name: string }>>('/warehouses', {
            query: { page: 1, pageSize: 100 },
          }),
        ]);
        setProducts(
          productResult.items.map((p) => ({ id: p.id, label: `${p.sku} — ${p.name}` })),
        );
        setDepartments(
          deptResult.items.map((d) => ({ id: d.id, label: `${d.code} — ${d.name}` })),
        );
        setSuppliers(
          supplierResult.items.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` })),
        );
        setWarehouses(
          warehouseResult.items.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` })),
        );
      } catch {
        // ignore — forms show empty dropdowns
      }
    }
    void loadOptions();
  }, []);

  function openCreate() {
    setDepartmentId('');
    setNotes('');
    setLines([{ productId: products[0]?.id ?? '', quantity: '1' }]);
    setFormError(null);
    setFormOpen(true);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const parsedLines = lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
      }));
      for (const line of parsedLines) {
        if (!line.productId || !Number.isInteger(line.quantity) || line.quantity < 1) {
          setFormError('Each line needs a product and quantity of at least 1');
          setSaving(false);
          return;
        }
      }

      await apiRequest('/purchase-requisitions', {
        method: 'POST',
        body: {
          departmentId: departmentId || null,
          notes: notes || null,
          lines: parsedLines,
        },
      });
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to create requisition');
    } finally {
      setSaving(false);
    }
  }

  async function openView(pr: PrRow) {
    try {
      const detail = await apiRequest<PrDetail>(`/purchase-requisitions/${pr.id}`);
      setViewPr(detail);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to load requisition');
    }
  }

  async function openConvert(pr: PrRow) {
    try {
      const detail = await apiRequest<PrDetail>(`/purchase-requisitions/${pr.id}`);
      const prices: Record<string, string> = {};
      for (const line of detail.lines) {
        prices[line.id] = '0';
      }
      setConvertPr(detail);
      setUnitPrices(prices);
      setSupplierId(suppliers[0]?.id ?? '');
      setWarehouseId(warehouses[0]?.id ?? '');
      setOrderDate(new Date().toISOString().slice(0, 10));
      setConvertError(null);
      setConvertOpen(true);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Failed to load requisition');
    }
  }

  async function onConvert(e: FormEvent) {
    e.preventDefault();
    if (!convertPr) return;
    setConverting(true);
    setConvertError(null);
    try {
      await apiRequest(`/purchase-requisitions/${convertPr.id}/convert`, {
        method: 'POST',
        body: {
          supplierId,
          warehouseId,
          orderDate,
          lines: convertPr.lines.map((line) => ({
            lineId: line.id,
            unitPrice: Number(unitPrices[line.id] ?? 0),
          })),
        },
      });
      setConvertOpen(false);
      setConvertPr(null);
      refresh();
    } catch (err) {
      setConvertError(err instanceof ApiClientError ? err.message : 'Failed to convert');
    } finally {
      setConverting(false);
    }
  }

  async function onConfirmAction() {
    if (!actionTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const path = `/purchase-requisitions/${actionTarget.pr.id}/${actionTarget.action}`;
      await apiRequest(path, { method: 'POST' });
      setActionTarget(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function onReject(e: FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejecting(true);
    setRejectError(null);
    try {
      await apiRequest(`/purchase-requisitions/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason },
      });
      setRejectOpen(false);
      setRejectTarget(null);
      refresh();
    } catch (err) {
      setRejectError(err instanceof ApiClientError ? err.message : 'Failed to reject');
    } finally {
      setRejecting(false);
    }
  }

  return (
    <>
      <ResourceListPage<PrRow>
        key={reloadKey}
        title="Purchase requisitions"
        description="Ask for items first. Flow: Draft → Submit → Approve → Convert to PO."
        endpoint="/purchase-requisitions"
        permission="requisitions.view"
        canCreate={can('requisitions.create')}
        createLabel="New requisition"
        onCreate={openCreate}
        columns={[
          {
            key: 'number',
            header: 'Number',
            render: (pr) => <span className="mono text-xs">{pr.number}</span>,
          },
          { key: 'requester', header: 'Requested by', render: (pr) => pr.requestedBy.email },
          {
            key: 'dept',
            header: 'Department',
            render: (pr) => pr.department?.name ?? '—',
          },
          { key: 'lines', header: 'Lines', render: (pr) => pr.lineCount },
          { key: 'status', header: 'Status', render: (pr) => statusBadge(pr.status) },
        ]}
        actions={(pr) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => void openView(pr) },
              ...(can('requisitions.update') && pr.status === 'DRAFT'
                ? [
                    {
                      label: 'Submit',
                      onClick: () => {
                        setActionError(null);
                        setActionTarget({ pr, action: 'submit' });
                      },
                    },
                  ]
                : []),
              ...(can('requisitions.approve') && pr.status === 'SUBMITTED'
                ? [
                    {
                      label: 'Approve',
                      onClick: () => {
                        setActionError(null);
                        setActionTarget({ pr, action: 'approve' });
                      },
                    },
                    {
                      label: 'Reject',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setRejectReason('');
                        setRejectError(null);
                        setRejectTarget(pr);
                        setRejectOpen(true);
                      },
                    },
                  ]
                : []),
              ...(can('purchasing.create') && pr.status === 'APPROVED'
                ? [{ label: 'Convert to PO', onClick: () => void openConvert(pr) }]
                : []),
              ...(can('requisitions.update') &&
              (pr.status === 'DRAFT' || pr.status === 'SUBMITTED')
                ? [
                    {
                      label: 'Cancel',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setActionError(null);
                        setActionTarget({ pr, action: 'cancel' });
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create purchase requisition</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreate}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label>Department (optional)</Label>
              <Select value={departmentId || undefined} onValueChange={(v) => setDepartmentId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label>Lines</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      { productId: products[0]?.id ?? '', quantity: '1' },
                    ])
                  }
                >
                  Add line
                </Button>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
                  <Select
                    value={line.productId}
                    onValueChange={(v) =>
                      setLines((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, productId: v ?? '' } : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, quantity: e.target.value } : item,
                        ),
                      )
                    }
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create draft'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewPr)} onOpenChange={(open) => !open && setViewPr(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewPr?.number ?? 'Requisition'}</DialogTitle>
          </DialogHeader>
          {viewPr ? (
            <div className="space-y-3 text-sm">
              <p>
                Status: {statusBadge(viewPr.status)} · Requested by: {viewPr.requestedBy.email}
              </p>
              {viewPr.rejectReason ? (
                <p className="text-destructive">Reject reason: {viewPr.rejectReason}</p>
              ) : null}
              {viewPr.purchaseOrders.length > 0 ? (
                <p>
                  Linked PO:{' '}
                  {viewPr.purchaseOrders.map((po) => `${po.number} (${po.status})`).join(', ')}
                </p>
              ) : null}
              <div className="space-y-1">
                {viewPr.lines.map((line) => (
                  <div key={line.id} className="rounded border px-3 py-2">
                    <div className="font-medium">
                      {line.product.sku} — {line.product.name}
                    </div>
                    <div className="text-muted-foreground">
                      Qty {line.quantity} {line.product.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejectTarget?.number}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onReject}>
            {rejectError ? <p className="text-sm text-destructive">{rejectError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={rejecting}>
                {rejecting ? 'Rejecting…' : 'Reject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert {convertPr?.number} to purchase order</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onConvert}>
            {convertError ? <p className="text-sm text-destructive">{convertError}</p> : null}
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orderDate">Order date</Label>
              <Input
                id="orderDate"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Unit prices</Label>
              {convertPr?.lines.map((line) => (
                <div key={line.id} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                  <div className="text-sm">
                    {line.product.sku} × {line.quantity}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitPrices[line.id] ?? '0'}
                    onChange={(e) =>
                      setUnitPrices((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                    required
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setConvertOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={converting}>
                {converting ? 'Converting…' : 'Create draft PO'}
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
        title={
          actionTarget?.action === 'submit'
            ? 'Submit requisition'
            : actionTarget?.action === 'approve'
              ? 'Approve requisition'
              : 'Cancel requisition'
        }
        description={
          actionTarget?.action === 'submit'
            ? `Submit ${actionTarget.pr.number} for approval?`
            : actionTarget?.action === 'approve'
              ? `Approve ${actionTarget.pr.number}?`
              : `Cancel ${actionTarget?.pr.number ?? ''}?`
        }
        confirmLabel={
          actionTarget?.action === 'submit'
            ? 'Submit'
            : actionTarget?.action === 'approve'
              ? 'Approve'
              : 'Cancel requisition'
        }
        confirmVariant={actionTarget?.action === 'cancel' ? 'destructive' : 'default'}
        loading={actionLoading}
        error={actionError}
        onConfirm={onConfirmAction}
      />
    </>
  );
}
