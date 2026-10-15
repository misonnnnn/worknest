'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResourceListPage } from '@/components/resource-list';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/helpdesk/badges';
import { apiRequest, apiUpload, ApiClientError } from '@/lib/api';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  filterSelectClassName,
  formatDateTime,
  previewText,
  selectClassName,
  textareaClassName,
  type HelpdeskLookups,
  type HelpdeskTicket,
  type ITTicketPriority,
} from '@/lib/helpdesk';
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

const MAX_ATTACHMENTS = 5;
const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/gif';

type TicketListPageProps = {
  title: string;
  description: string;
  scope: 'all' | 'mine' | 'assigned';
  createEnabled?: boolean;
};

type TicketForm = {
  title: string;
  description: string;
  categoryId: string;
  priority: ITTicketPriority;
};

export function TicketListPage({
  title,
  description,
  scope,
  createEnabled = false,
}: TicketListPageProps) {
  const { can } = useAuth();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [lookups, setLookups] = useState<HelpdeskLookups | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TicketForm>({
    title: '',
    description: '',
    categoryId: '',
    priority: 'MEDIUM',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    void apiRequest<HelpdeskLookups>('/helpdesk/lookups').then(setLookups).catch(() => undefined);
  }, []);

  const queryExtras = useMemo(
    () => ({
      scope,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      categoryId: categoryFilter || undefined,
    }),
    [scope, statusFilter, priorityFilter, categoryFilter],
  );

  const canCreate = createEnabled && can('helpdesk.create');

  function openCreate() {
    setForm({
      title: '',
      description: '',
      categoryId: lookups?.categories[0]?.id ?? '',
      priority: 'MEDIUM',
    });
    setImages([]);
    setFormError(null);
    setFormOpen(true);
  }

  function onImagesSelected(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = [...images, ...Array.from(fileList)].slice(0, MAX_ATTACHMENTS);
    setImages(next);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const ticket = await apiRequest<HelpdeskTicket>('/helpdesk/tickets', {
        method: 'POST',
        body: {
          title: form.title,
          description: form.description,
          categoryId: form.categoryId,
          priority: form.priority,
        },
      });

      if (images.length > 0) {
        const formData = new FormData();
        for (const file of images) {
          formData.append('files', file);
        }
        await apiUpload(`/helpdesk/tickets/${ticket.id}/attachments`, formData);
      }

      setFormOpen(false);
      setImages([]);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to create ticket');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ResourceListPage<HelpdeskTicket>
        key={reloadKey}
        title={title}
        description={description}
        endpoint="/helpdesk/tickets"
        permission="helpdesk.view"
        searchPlaceholder="Search ticket number or title…"
        canCreate={canCreate}
        createLabel="New ticket"
        onCreate={openCreate}
        onRowClick={(ticket) => router.push(`/helpdesk/tickets/${ticket.id}`)}
        queryExtras={queryExtras}
        filters={
          <>
            <select
              className={filterSelectClassName}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {(lookups?.statuses ?? Object.keys(STATUS_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value as keyof typeof STATUS_LABELS] ?? value}
                </option>
              ))}
            </select>
            <select
              className={filterSelectClassName}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All priorities</option>
              {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value as ITTicketPriority] ?? value}
                </option>
              ))}
            </select>
            <select
              className={filterSelectClassName}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {(lookups?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </>
        }
        columns={[
          {
            key: 'number',
            header: 'Ticket',
            render: (t) => <span className="mono text-xs">{t.ticketNumber}</span>,
          },
          { key: 'title', header: 'Title', render: (t) => previewText(t.title, 50) },
          { key: 'category', header: 'Category', render: (t) => t.category?.name ?? '—' },
          {
            key: 'requester',
            header: 'Requester',
            render: (t) => t.requester?.displayName ?? '—',
          },
          {
            key: 'assignee',
            header: 'Assignee',
            render: (t) => t.assignee?.displayName ?? '—',
          },
          {
            key: 'priority',
            header: 'Priority',
            render: (t) => <TicketPriorityBadge priority={t.priority} />,
          },
          {
            key: 'status',
            header: 'Status',
            render: (t) => <TicketStatusBadge status={t.status} />,
          },
          {
            key: 'created',
            header: 'Created',
            render: (t) => formatDateTime(t.createdAt),
          },
        ]}
        actions={(ticket) => (
          <RowActions
            actions={[
              {
                label: 'View',
                onClick: () => router.push(`/helpdesk/tickets/${ticket.id}`),
              },
            ]}
          />
        )}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className={textareaClassName}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="categoryId">Category</Label>
                <select
                  id="categoryId"
                  className={selectClassName}
                  value={form.categoryId}
                  onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                  required
                >
                  <option value="">Select category</option>
                  {(lookups?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  className={selectClassName}
                  value={form.priority}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      priority: e.target.value as ITTicketPriority,
                    }))
                  }
                >
                  {(lookups?.priorities ?? Object.keys(PRIORITY_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value as ITTicketPriority]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attachments">Images (optional)</Label>
              <Input
                id="attachments"
                type="file"
                accept={ACCEPT_IMAGES}
                multiple
                onChange={(e) => {
                  onImagesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WebP, or GIF — up to {MAX_ATTACHMENTS} images, 10MB each.
              </p>
              {images.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {images.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create ticket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
