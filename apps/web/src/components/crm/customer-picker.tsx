'use client';

import { useEffect, useRef, useState } from 'react';
import type { PaginatedResult } from '@worknest/types';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import { customerTitle, type CrmCustomerRow } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type CreateForm = {
  name: string;
  phone: string;
  email: string;
};

export function CustomerPicker({
  value,
  selectedLabel,
  onSelect,
  disabled,
  allowCreate = false,
}: {
  value: string;
  selectedLabel?: string;
  onSelect: (customer: CrmCustomerRow) => void;
  disabled?: boolean;
  allowCreate?: boolean;
}) {
  const { can } = useAuth();
  const canCreate = allowCreate && can('crm.create');
  const panelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CrmCustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({
    name: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    if (!open || createOpen) return;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const data = await apiRequest<PaginatedResult<CrmCustomerRow>>('/crm/customers', {
          query: { page: 1, pageSize: 8, search: query, isActive: true },
        });
        setResults(data.items);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, open, createOpen]);

  function startCreate() {
    setCreateForm({
      name: query.trim(),
      phone: '',
      email: '',
    });
    setCreateError(null);
    setCreateOpen(true);
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    setCreateOpen(false);
    setCreateError(null);
    setQuery('');
  }

  function handleSearchBlur() {
    window.setTimeout(() => {
      if (creating || createOpen) return;
      const active = document.activeElement;
      if (panelRef.current?.contains(active)) return;
      closePanel();
    }, 150);
  }

  async function onCreateCustomer() {
    if (!createForm.name.trim()) {
      setCreateError('Customer name is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await apiRequest<CrmCustomerRow>('/crm/customers', {
        method: 'POST',
        body: {
          name: createForm.name.trim(),
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
        },
      });
      onSelect({
        ...created,
        interactionCount: 0,
        caseCount: 0,
        followUpCount: 0,
      });
      closePanel();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : 'Failed to create customer');
    } finally {
      setCreating(false);
    }
  }

  const showCreateOption =
    canCreate && !loading && !createOpen && query.trim().length > 0 && results.length === 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={open && !createOpen ? query : selectedLabel || query}
          disabled={disabled || createOpen}
          placeholder="Search name, phone, or email…"
          onFocus={() => {
            if (createOpen) return;
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            if (createOpen) return;
            setOpen(true);
            setQuery(e.target.value);
          }}
          onBlur={handleSearchBlur}
        />

        {open && !createOpen ? (
          <div
            ref={panelRef}
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
          >
            {loading ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <div className="px-2 py-2">
                <p className="text-sm text-muted-foreground">No customers found.</p>
                {showCreateOption ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={startCreate}
                  >
                    Create new customer
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                {results.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(customer);
                      closePanel();
                    }}
                  >
                    <span className="text-sm font-medium">{customerTitle(customer)}</span>
                    <span className="text-xs text-muted-foreground">
                      {customer.name}
                      {customer.phone ? ` · ${customer.phone}` : ''}
                      {customer.email ? ` · ${customer.email}` : ''}
                    </span>
                  </button>
                ))}
                {canCreate ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 w-full justify-start text-muted-foreground"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={startCreate}
                  >
                    + Create new customer
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {createOpen ? (
        <div
          ref={panelRef}
          className="space-y-2 rounded-lg border bg-muted/30 p-3"
        >
          <p className="text-sm font-medium">Create new customer</p>
          {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="picker-name">Customer name</Label>
            <Input
              id="picker-name"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void onCreateCustomer();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="picker-phone">Phone</Label>
            <Input
              id="picker-phone"
              value={createForm.phone}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="picker-email">Email</Label>
            <Input
              id="picker-email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                setOpen(true);
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={creating}
              onClick={() => void onCreateCustomer()}
            >
              {creating ? 'Creating…' : 'Create & select'}
            </Button>
          </div>
        </div>
      ) : null}

      {value && !open && !createOpen ? (
        <p className="sr-only">Selected customer {selectedLabel}</p>
      ) : null}
    </div>
  );
}
