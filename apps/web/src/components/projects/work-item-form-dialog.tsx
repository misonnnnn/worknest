'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, ApiClientError } from '@/lib/api';
import type { ProjectLookups, WorkItemRow } from '@/lib/projects';
import { NONE, PRIORITIES, priorityLabel, textareaClassName, userLine } from '@/lib/projects';
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

type WorkItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  lookups: ProjectLookups | null;
  onSaved: (item: WorkItemRow) => void;
};

type FormState = {
  typeId: string;
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
  assigneeId: string;
  dueDate: string;
};

const emptyForm: FormState = {
  typeId: '',
  title: '',
  description: '',
  priority: 'MEDIUM',
  assigneeId: NONE,
  dueDate: '',
};

export function WorkItemFormDialog({
  open,
  onOpenChange,
  projectId,
  lookups,
  onSaved,
}: WorkItemFormDialogProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const bugType = lookups?.workItemTypes.find((type) => type.name.toLowerCase() === 'bug');
    setForm({
      ...emptyForm,
      typeId: bugType?.id ?? lookups?.workItemTypes[0]?.id ?? '',
    });
    setError(null);
  }, [open, lookups]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const item = await apiRequest<WorkItemRow>(`/projects/${projectId}/work-items`, {
        method: 'POST',
        body: {
          typeId: form.typeId,
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          assigneeId: form.assigneeId === NONE ? null : form.assigneeId,
          dueDate: form.dueDate || null,
        },
      });
      onOpenChange(false);
      onSaved(item);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to report work item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report issue</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSave}>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <p className="text-xs text-muted-foreground">
            Reporter: {user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.email}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Issue type</Label>
              <Select
                value={form.typeId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, typeId: value ?? '' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(lookups?.workItemTypes ?? []).map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    priority: (value as FormState['priority']) ?? 'MEDIUM',
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priorityLabel(priority)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-title">Title</Label>
            <Input
              id="wi-title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-description">Description</Label>
            <textarea
              id="wi-description"
              className={textareaClassName}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select
                value={form.assigneeId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, assigneeId: value ?? NONE }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {(lookups?.users ?? []).map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {userLine(person)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-due">Due date</Label>
              <Input
                id="wi-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.typeId}>
              {saving ? 'Saving…' : 'Report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
