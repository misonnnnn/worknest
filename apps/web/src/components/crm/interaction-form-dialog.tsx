'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CustomerPicker } from '@/components/crm/customer-picker';
import { apiRequest, ApiClientError } from '@/lib/api';
import {
  CHANNEL_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  INQUIRY_OPTIONS,
  INTERACTION_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
  PRIORITY_LABELS,
  RESOLUTION_LABELS,
  STORE_LABELS,
  STORE_OPTIONS,
  customerTitle,
  selectClassName,
  textareaClassName,
  toDateTimeLocal,
  type CrmChannel,
  type CrmCustomerRow,
  type CrmFollowUpType,
  type CrmInteractionRow,
  type CrmInteractionStatus,
  type CrmInteractionType,
  type CrmLookups,
  type CrmPriority,
  type CrmResolution,
  type CrmStore,
} from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type InteractionFormState = {
  customerId: string;
  agentId: string;
  store: CrmStore | '';
  storeOther: string;
  orderNumber: string;
  channel: CrmChannel;
  interactionType: CrmInteractionType;
  interactionDate: string;
  duration: string;
  inquiry: string;
  notes: string;
  resolution: CrmResolution | '';
  status: CrmInteractionStatus;
  priority: CrmPriority;
  followUpRequired: boolean;
  followUpDate: string;
  followUpType: CrmFollowUpType;
  followUpAssignedToId: string;
  followUpNotes: string;
};

const emptyForm = (userId: string): InteractionFormState => ({
  customerId: '',
  agentId: userId,
  store: '',
  storeOther: '',
  orderNumber: '',
  channel: 'PHONE',
  interactionType: 'INBOUND_CALL',
  interactionDate: toDateTimeLocal(),
  duration: '',
  inquiry: '',
  notes: '',
  resolution: '',
  status: 'COMPLETED',
  priority: 'NORMAL',
  followUpRequired: false,
  followUpDate: toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  followUpType: 'CALL',
  followUpAssignedToId: userId,
  followUpNotes: '',
});

export function InteractionFormDialog({
  open,
  onOpenChange,
  lookups,
  editing,
  presetCustomer,
  presetCaseId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: CrmLookups | null;
  editing?: CrmInteractionRow | null;
  presetCustomer?: CrmCustomerRow | null;
  presetCaseId?: string;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<InteractionFormState>(emptyForm(user?.id ?? ''));
  const [customer, setCustomer] = useState<CrmCustomerRow | null>(presetCustomer ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const baselineRef = useRef('');

  function snapshot(state: InteractionFormState) {
    return JSON.stringify(state);
  }

  useEffect(() => {
    if (!open) return;
    let next = emptyForm(user?.id ?? '');
    if (editing) {
      next = {
        ...next,
        customerId: editing.customerId,
        agentId: editing.agentId,
        store: editing.store,
        storeOther: editing.storeOther ?? '',
        orderNumber: editing.orderNumber ?? '',
        channel: editing.channel,
        interactionType: editing.interactionType,
        interactionDate: toDateTimeLocal(editing.interactionDate),
        duration: editing.duration ?? '',
        inquiry: editing.inquiry ?? '',
        notes: editing.notes ?? '',
        resolution: editing.resolution ?? '',
        status: editing.status,
        priority: editing.priority,
      };
      setCustomer({
        ...editing.customer,
        notes: null,
        isActive: true,
        interactionCount: 0,
        caseCount: 0,
        followUpCount: 0,
      });
    } else if (presetCustomer) {
      next.customerId = presetCustomer.id;
      setCustomer(presetCustomer);
    } else {
      setCustomer(null);
    }
    setForm(next);
    baselineRef.current = snapshot(next);
    setError(null);
    setConfirmCloseOpen(false);
  }, [open, editing, presetCustomer, user?.id]);

  const isDirty = useMemo(
    () => open && snapshot(form) !== baselineRef.current,
    [open, form],
  );

  function requestClose() {
    if (isDirty && !saving) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose();
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!form.customerId) {
      setError('Select a customer first.');
      return;
    }
    if (!form.store) {
      setError('Select a store.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        customerId: form.customerId,
        caseId: editing?.caseId || presetCaseId || undefined,
        agentId: form.agentId || undefined,
        store: form.store,
        storeOther: form.store === 'OTHER' ? form.storeOther.trim() : null,
        orderNumber: form.orderNumber.trim() || null,
        channel: form.channel,
        interactionType: form.interactionType,
        interactionDate: new Date(form.interactionDate).toISOString(),
        duration: form.duration || null,
        inquiry: form.inquiry,
        notes: form.notes || null,
        resolution: form.resolution || null,
        status: form.status,
        priority: form.priority,
        followUp:
          !editing && form.followUpRequired
            ? {
                followUpDate: new Date(form.followUpDate).toISOString(),
                followUpType: form.followUpType,
                assignedToId: form.followUpAssignedToId || form.agentId,
                notes: form.followUpNotes || null,
              }
            : undefined,
      };
      if (editing) {
        await apiRequest(`/crm/interactions/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/crm/interactions', { method: 'POST', body });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save interaction');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit interaction' : 'Add interaction'}</DialogTitle>
        </DialogHeader>
        <form className="space-y-5" onSubmit={onSave}>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">Customer</h3>
            <CustomerPicker
              value={form.customerId}
              selectedLabel={customer ? customerTitle(customer) : ''}
              disabled={Boolean(presetCustomer) && !editing}
              allowCreate={!editing && !presetCustomer}
              onSelect={(selected) => {
                setCustomer(selected);
                setForm((prev) => ({ ...prev, customerId: selected.id }));
              }}
            />
            {customer ? (
              <div className="grid gap-1 rounded-md bg-muted/50 px-3 py-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Name: </span>
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
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">Interaction</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="store">Store</Label>
                <select
                  id="store"
                  className={selectClassName}
                  required
                  value={form.store}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, store: e.target.value as CrmStore | '' }))
                  }
                >
                  <option value="">Select store…</option>
                  {(lookups?.stores ?? STORE_OPTIONS).map((value) => (
                    <option key={value} value={value}>
                      {STORE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              {form.store === 'OTHER' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="storeOther">Store name</Label>
                  <Input
                    id="storeOther"
                    value={form.storeOther}
                    onChange={(e) => setForm((prev) => ({ ...prev, storeOther: e.target.value }))}
                    placeholder="Enter store name"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="orderNumber">Order number</Label>
                <Input
                  id="orderNumber"
                  value={form.orderNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, orderNumber: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="channel">Channel</Label>
                <select
                  id="channel"
                  className={selectClassName}
                  value={form.channel}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, channel: e.target.value as CrmChannel }))
                  }
                >
                  {(lookups?.channels ?? Object.keys(CHANNEL_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {CHANNEL_LABELS[value as CrmChannel]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interactionType">Interaction type</Label>
                <select
                  id="interactionType"
                  className={selectClassName}
                  value={form.interactionType}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      interactionType: e.target.value as CrmInteractionType,
                    }))
                  }
                >
                  {(lookups?.interactionTypes ?? Object.keys(INTERACTION_TYPE_LABELS)).map(
                    (value) => (
                      <option key={value} value={value}>
                        {INTERACTION_TYPE_LABELS[value as CrmInteractionType]}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interactionDate">Date / time</Label>
                <Input
                  id="interactionDate"
                  type="datetime-local"
                  value={form.interactionDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, interactionDate: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agentId">Agent</Label>
                <select
                  id="agentId"
                  className={selectClassName}
                  value={form.agentId}
                  onChange={(e) => setForm((prev) => ({ ...prev, agentId: e.target.value }))}
                >
                  {(lookups?.agents ?? []).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  placeholder="2:16"
                  value={form.duration}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  className={selectClassName}
                  value={form.priority}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, priority: e.target.value as CrmPriority }))
                  }
                >
                  {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value as CrmPriority]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className={selectClassName}
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value as CrmInteractionStatus,
                    }))
                  }
                >
                  {(lookups?.interactionStatuses ?? Object.keys(INTERACTION_STATUS_LABELS)).map(
                    (value) => (
                      <option key={value} value={value}>
                        {INTERACTION_STATUS_LABELS[value as CrmInteractionStatus]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">Inquiry</h3>
            <select
              id="inquiry"
              className={selectClassName}
              required
              value={form.inquiry}
              onChange={(e) => setForm((prev) => ({ ...prev, inquiry: e.target.value }))}
            >
              <option value="">Select inquiry…</option>
              {INQUIRY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {form.inquiry && !(INQUIRY_OPTIONS as readonly string[]).includes(form.inquiry) ? (
                <option value={form.inquiry}>{form.inquiry}</option>
              ) : null}
            </select>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">Call notes / summary</h3>
            <textarea
              className={textareaClassName}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="What was discussed and what did you do?"
            />
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">Resolution</h3>
            <select
              className={selectClassName}
              value={form.resolution}
              onChange={(e) => {
                const resolution = e.target.value as CrmResolution | '';
                setForm((prev) => ({
                  ...prev,
                  resolution,
                  followUpRequired:
                    resolution === 'CALLBACK_REQUIRED' ? true : prev.followUpRequired,
                }));
              }}
            >
              <option value="">Select outcome…</option>
              {(lookups?.resolutions ?? Object.keys(RESOLUTION_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {RESOLUTION_LABELS[value as CrmResolution]}
                </option>
              ))}
            </select>
          </section>

          {!editing ? (
            <section className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={form.followUpRequired}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, followUpRequired: e.target.checked }))
                  }
                />
                Follow-up required?
              </label>
              {form.followUpRequired ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="followUpDate">Follow-up date</Label>
                    <Input
                      id="followUpDate"
                      type="datetime-local"
                      value={form.followUpDate}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, followUpDate: e.target.value }))
                      }
                      required={form.followUpRequired}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="followUpType">Follow-up type</Label>
                    <select
                      id="followUpType"
                      className={selectClassName}
                      value={form.followUpType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          followUpType: e.target.value as CrmFollowUpType,
                        }))
                      }
                    >
                      {(lookups?.followUpTypes ?? Object.keys(FOLLOW_UP_TYPE_LABELS)).map(
                        (value) => (
                          <option key={value} value={value}>
                            {FOLLOW_UP_TYPE_LABELS[value as CrmFollowUpType]}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="followUpAssignedToId">Assigned employee</Label>
                    <select
                      id="followUpAssignedToId"
                      className={selectClassName}
                      value={form.followUpAssignedToId}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, followUpAssignedToId: e.target.value }))
                      }
                    >
                      {(lookups?.agents ?? []).map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="followUpNotes">Notes</Label>
                    <textarea
                      id="followUpNotes"
                      className={textareaClassName}
                      value={form.followUpNotes}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, followUpNotes: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Save interaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmCloseOpen}
      onOpenChange={setConfirmCloseOpen}
      title="Discard changes?"
      description="You have unsaved interaction details. Close this form anyway?"
      confirmLabel="Discard"
      confirmVariant="destructive"
      onConfirm={() => {
        setConfirmCloseOpen(false);
        onOpenChange(false);
      }}
    />
    </>
  );
}
