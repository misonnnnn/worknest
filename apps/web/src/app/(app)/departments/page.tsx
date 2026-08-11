'use client';

import { FormEvent, useState } from 'react';
import { ResourceListPage, StatusBadge } from '@/components/resource-list';
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

type DepartmentRow = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  employeeCount: number;
  positionCount: number;
};

export default function DepartmentsPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/departments', { method: 'POST', body: { name, code } });
      setOpen(false);
      setName('');
      setCode('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    }
  }

  return (
    <>
      <ResourceListPage<DepartmentRow>
        key={reloadKey}
        title="Departments"
        description="Organization departments."
        endpoint="/departments"
        permission="departments.view"
        canCreate={can('departments.create')}
        createLabel="New department"
        onCreate={() => setOpen(true)}
        columns={[
          { key: 'name', header: 'Name', render: (d) => d.name },
          {
            key: 'code',
            header: 'Code',
            render: (d) => <span className="mono text-xs">{d.code}</span>,
          },
          { key: 'employees', header: 'Employees', render: (d) => d.employeeCount },
          { key: 'positions', header: 'Positions', render: (d) => d.positionCount },
          { key: 'status', header: 'Status', render: (d) => <StatusBadge active={d.isActive} /> },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create department</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreate}>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
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
