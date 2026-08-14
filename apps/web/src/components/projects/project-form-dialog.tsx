'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, ApiClientError } from '@/lib/api';
import type { ProjectDetail, ProjectLookups, ProjectRow } from '@/lib/projects';
import { NONE, suggestKeyFromName, textareaClassName } from '@/lib/projects';
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

type ProjectFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: ProjectLookups | null;
  editing?: ProjectRow | ProjectDetail | null;
  onSaved: (project: ProjectDetail) => void;
};

type FormState = {
  name: string;
  key: string;
  description: string;
  departmentId: string;
  projectManagerId: string;
  statusId: string;
  startDate: string;
  endDate: string;
};

const emptyForm: FormState = {
  name: '',
  key: '',
  description: '',
  departmentId: NONE,
  projectManagerId: '',
  statusId: '',
  startDate: '',
  endDate: '',
};

export function ProjectFormDialog({
  open,
  onOpenChange,
  lookups,
  editing,
  onSaved,
}: ProjectFormDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        key: editing.key,
        description: editing.description ?? '',
        departmentId: editing.department?.id ?? NONE,
        projectManagerId: editing.projectManager.id,
        statusId: editing.status.id,
        startDate: editing.startDate?.slice(0, 10) ?? '',
        endDate: editing.endDate?.slice(0, 10) ?? '',
      });
      setKeyTouched(true);
    } else {
      const defaultStatus = lookups?.projectStatuses.find((s) => s.isDefault);
      setForm({
        ...emptyForm,
        statusId: defaultStatus?.id ?? lookups?.projectStatuses[0]?.id ?? '',
      });
      setKeyTouched(false);
    }
    setError(null);
  }, [open, editing, lookups]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        key: form.key.trim().toUpperCase() || undefined,
        description: form.description || null,
        departmentId: form.departmentId === NONE ? null : form.departmentId,
        projectManagerId: form.projectManagerId,
        statusId: form.statusId || undefined,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      const project = editing
        ? await apiRequest<ProjectDetail>(`/projects/${editing.id}`, { method: 'PATCH', body })
        : await apiRequest<ProjectDetail>('/projects', { method: 'POST', body });
      onOpenChange(false);
      onSaved(project);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit project' : 'Create project'}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSave}>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  key: keyTouched ? prev.key : suggestKeyFromName(name),
                }));
              }}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-key">Key</Label>
            <Input
              id="project-key"
              value={form.key}
              onChange={(e) => {
                setKeyTouched(true);
                setForm((prev) => ({ ...prev, key: e.target.value.toUpperCase() }));
              }}
              placeholder="WEB"
              maxLength={10}
            />
            <p className="text-xs text-muted-foreground">Used in work item keys, e.g. WEB-1.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <textarea
              id="project-description"
              className={textareaClassName}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, departmentId: value ?? NONE }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(lookups?.departments ?? []).map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.code} — {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.statusId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, statusId: value ?? '' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  {(lookups?.projectStatuses ?? []).map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Project manager</Label>
            <Select
              value={form.projectManagerId}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, projectManagerId: value ?? '' }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select project manager" />
              </SelectTrigger>
              <SelectContent>
                {(lookups?.users ?? []).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.departmentName
                      ? `${user.displayName} — ${user.departmentName}`
                      : user.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start-date">Start date</Label>
              <Input
                id="start-date"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date">End date</Label>
              <Input
                id="end-date"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.projectManagerId}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
