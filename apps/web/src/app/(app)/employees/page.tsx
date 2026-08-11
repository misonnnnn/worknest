'use client';

import { FormEvent, useState } from 'react';
import { ResourceListPage } from '@/components/resource-list';
import { useAuth } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
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

type EmployeeRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  employmentStatus: string;
  department: { name: string } | null;
  position: { title: string } | null;
};

export default function EmployeesPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employeeNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    hireDate: new Date().toISOString().slice(0, 10),
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/employees', { method: 'POST', body: form });
      setOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee');
    }
  }

  return (
    <>
      <ResourceListPage<EmployeeRow>
        key={reloadKey}
        title="Employees"
        description="Core HR employee records."
        endpoint="/employees"
        permission="employees.view"
        canCreate={can('employees.create')}
        createLabel="New employee"
        onCreate={() => setOpen(true)}
        columns={[
          {
            key: 'number',
            header: 'Employee #',
            render: (e) => <span className="mono text-xs">{e.employeeNumber}</span>,
          },
          {
            key: 'name',
            header: 'Name',
            render: (e) => `${e.firstName} ${e.lastName}`,
          },
          { key: 'email', header: 'Email', render: (e) => e.email },
          {
            key: 'department',
            header: 'Department',
            render: (e) => e.department?.name || '—',
          },
          {
            key: 'position',
            header: 'Position',
            render: (e) => e.position?.title || '—',
          },
          {
            key: 'status',
            header: 'Status',
            render: (e) => (
              <Badge variant="secondary" className="rounded-md font-normal">
                {e.employmentStatus}
              </Badge>
            ),
          },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create employee</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreate}>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {(
              [
                ['employeeNumber', 'Employee number'],
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['email', 'Email'],
                ['hireDate', 'Hire date'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type={key === 'hireDate' ? 'date' : key === 'email' ? 'email' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  required
                />
              </div>
            ))}
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
