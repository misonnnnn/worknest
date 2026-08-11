'use client';

import { FormEvent, useState } from 'react';
import { ResourceListPage } from '@/components/resource-list';
import { useAuth } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
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

type PositionRow = {
  id: string;
  title: string;
  code: string;
  department: { name: string } | null;
  employeeCount: number;
};

export default function PositionsPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/positions', { method: 'POST', body: { title, code } });
      setOpen(false);
      setTitle('');
      setCode('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create position');
    }
  }

  return (
    <>
      <ResourceListPage<PositionRow>
        key={reloadKey}
        title="Positions"
        description="Job positions across the organization."
        endpoint="/positions"
        permission="positions.view"
        canCreate={can('positions.create')}
        createLabel="New position"
        onCreate={() => setOpen(true)}
        columns={[
          { key: 'title', header: 'Title', render: (p) => p.title },
          {
            key: 'code',
            header: 'Code',
            render: (p) => <span className="mono text-xs">{p.code}</span>,
          },
          {
            key: 'department',
            header: 'Department',
            render: (p) => p.department?.name || '—',
          },
          { key: 'employees', header: 'Employees', render: (p) => p.employeeCount },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create position</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreate}>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
