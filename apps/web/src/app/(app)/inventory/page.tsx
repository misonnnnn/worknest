'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
import { ResourceListPage } from '@/components/resource-list';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
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

type StockRow = {
  id: string;
  quantity: number;
  product: { id: string; sku: string; name: string; unit: string };
  warehouse: { id: string; code: string; name: string };
};

type MovementRow = {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;
  notes: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string };
  warehouse: { id: string; code: string; name: string };
};

type Option = { id: string; label: string };

export default function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [reloadKey, setReloadKey] = useState(0);

  const [products, setProducts] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantityChange, setQuantityChange] = useState('0');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [productResult, warehouseResult] = await Promise.all([
          apiRequest<PaginatedResult<{ id: string; sku: string; name: string }>>('/products', {
            query: { page: 1, pageSize: 100 },
          }),
          apiRequest<PaginatedResult<{ id: string; code: string; name: string }>>('/warehouses', {
            query: { page: 1, pageSize: 100 },
          }),
        ]);
        setProducts(
          productResult.items.map((p) => ({ id: p.id, label: `${p.sku} — ${p.name}` })),
        );
        setWarehouses(
          warehouseResult.items.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` })),
        );
      } catch {
        // Options load can fail if user lacks product/warehouse view — adjust form will show empty lists
      }
    }
    void loadOptions();
  }, []);

  function openAdjust() {
    setWarehouseId(warehouses[0]?.id ?? '');
    setProductId(products[0]?.id ?? '');
    setQuantityChange('0');
    setNotes('');
    setFormError(null);
    setAdjustOpen(true);
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const change = Number(quantityChange);
      if (!Number.isInteger(change) || change === 0) {
        setFormError('Enter a non-zero whole number (positive = add, negative = remove)');
        return;
      }
      await apiRequest('/inventory/adjust', {
        method: 'POST',
        body: {
          warehouseId,
          productId,
          quantityChange: change,
          notes: notes || undefined,
        },
      });
      setAdjustOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to adjust stock');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={tab === 'stock' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('stock')}
        >
          Stock on hand
        </Button>
        <Button
          type="button"
          variant={tab === 'movements' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('movements')}
        >
          Movements
        </Button>
      </div>

      {tab === 'stock' ? (
        <ResourceListPage<StockRow>
          key={`stock-${reloadKey}`}
          title="Inventory"
          description="Current stock by product and warehouse. Use Adjust for manual corrections."
          endpoint="/inventory/stock"
          permission="inventory.view"
          canCreate={can('inventory.adjust')}
          createLabel="Adjust stock"
          onCreate={openAdjust}
          columns={[
            {
              key: 'sku',
              header: 'SKU',
              render: (row) => <span className="mono text-xs">{row.product.sku}</span>,
            },
            { key: 'product', header: 'Product', render: (row) => row.product.name },
            {
              key: 'warehouse',
              header: 'Warehouse',
              render: (row) => `${row.warehouse.code} — ${row.warehouse.name}`,
            },
            {
              key: 'qty',
              header: 'Qty',
              render: (row) => `${row.quantity} ${row.product.unit}`,
            },
          ]}
        />
      ) : (
        <ResourceListPage<MovementRow>
          key={`movements-${reloadKey}`}
          title="Stock movements"
          description="History of stock in, out, and adjustments."
          endpoint="/inventory/movements"
          permission="inventory.view"
          columns={[
            {
              key: 'when',
              header: 'When',
              render: (row) => new Date(row.createdAt).toLocaleString(),
            },
            { key: 'type', header: 'Type', render: (row) => row.type },
            {
              key: 'sku',
              header: 'SKU',
              render: (row) => <span className="mono text-xs">{row.product.sku}</span>,
            },
            { key: 'product', header: 'Product', render: (row) => row.product.name },
            { key: 'warehouse', header: 'Warehouse', render: (row) => row.warehouse.code },
            { key: 'qty', header: 'Qty', render: (row) => row.quantity },
            { key: 'notes', header: 'Notes', render: (row) => row.notes ?? '—' },
          ]}
        />
      )}

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onAdjust}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
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
              <Label>Product</Label>
              <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity change</Label>
              <Input
                id="qty"
                type="number"
                value={quantityChange}
                onChange={(e) => setQuantityChange(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Use +10 to add 10, or -3 to remove 3.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional reason"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Apply'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
