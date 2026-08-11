'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { EmploymentStatus, PaginatedResult } from '@worknest/types';
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

const NONE = '__none__';

const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'ON_LEAVE',
  'TERMINATED',
];

type DepartmentOption = { id: string; name: string };
type PositionOption = { id: string; title: string };
type ManagerOption = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
};

type EmployeeRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  department: { id: string; name: string } | null;
  position: { id: string; title: string } | null;
  manager: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
};

type EmployeeFormState = {
  employeeNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  departmentId: string;
  positionId: string;
  managerId: string;
};

const emptyForm: EmployeeFormState = {
  employeeNumber: '',
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  hireDate: new Date().toISOString().slice(0, 10),
  employmentStatus: 'ACTIVE',
  departmentId: NONE,
  positionId: NONE,
  managerId: NONE,
};

function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function EmployeesPage() {
  const { can } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [deptData, positionData, employeeData] = await Promise.all([
          can('departments.view')
            ? apiRequest<PaginatedResult<DepartmentOption>>('/departments', {
                query: { page: 1, pageSize: 100, isActive: true },
              })
            : Promise.resolve({ items: [] as DepartmentOption[] }),
          can('positions.view')
            ? apiRequest<PaginatedResult<PositionOption>>('/positions', {
                query: { page: 1, pageSize: 100 },
              })
            : Promise.resolve({ items: [] as PositionOption[] }),
          apiRequest<PaginatedResult<ManagerOption>>('/employees', {
            query: { page: 1, pageSize: 100, employmentStatus: 'ACTIVE' },
          }),
        ]);
        setDepartments(deptData.items);
        setPositions(positionData.items);
        setManagers(employeeData.items);
      } catch {
        setDepartments([]);
        setPositions([]);
        setManagers([]);
      }
    }
    void loadOptions();
  }, [can, reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(employee: EmployeeRow) {
    setEditing(employee);
    setForm({
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      middleName: employee.middleName ?? '',
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone ?? '',
      dateOfBirth: toDateInput(employee.dateOfBirth),
      hireDate: toDateInput(employee.hireDate),
      employmentStatus: employee.employmentStatus,
      departmentId: employee.departmentId ?? employee.department?.id ?? NONE,
      positionId: employee.positionId ?? employee.position?.id ?? NONE,
      managerId: employee.managerId ?? employee.manager?.id ?? NONE,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        employeeNumber: form.employeeNumber,
        firstName: form.firstName,
        middleName: form.middleName || null,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
        dateOfBirth: form.dateOfBirth || null,
        hireDate: form.hireDate,
        employmentStatus: form.employmentStatus,
        departmentId: form.departmentId === NONE ? null : form.departmentId,
        positionId: form.positionId === NONE ? null : form.positionId,
        managerId: form.managerId === NONE ? null : form.managerId,
      };
      if (editing) {
        await apiRequest(`/employees/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/employees', { method: 'POST', body });
      }
      setFormOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Failed to save employee');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/employees/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete employee');
    } finally {
      setDeleting(false);
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
        onCreate={openCreate}
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
        actions={(employee) => (
          <RowActions
            actions={[
              ...(can('employees.update')
                ? [{ label: 'Edit', onClick: () => openEdit(employee) }]
                : []),
              ...(can('employees.delete')
                ? [
                    {
                      label: 'Delete',
                      variant: 'destructive' as const,
                      onClick: () => {
                        setDeleteError(null);
                        setDeleteTarget(employee);
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit employee' : 'Create employee'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="employeeNumber">Employee number</Label>
                <Input
                  id="employeeNumber"
                  value={form.employeeNumber}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, employeeNumber: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="middleName">Middle name</Label>
                <Input
                  id="middleName"
                  value={form.middleName}
                  onChange={(e) => setForm((prev) => ({ ...prev, middleName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hireDate">Hire date</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, hireDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Employment status</Label>
                <Select
                  value={form.employmentStatus}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      employmentStatus: (value as EmploymentStatus) || 'ACTIVE',
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={form.departmentId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, departmentId: value ?? NONE }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No department</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Select
                  value={form.positionId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, positionId: value ?? NONE }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No position</SelectItem>
                    {positions.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        {position.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Select
                value={form.managerId}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, managerId: value ?? NONE }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No manager</SelectItem>
                  {managers
                    .filter((manager) => manager.id !== editing?.id)
                    .map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.firstName} {manager.lastName} ({manager.employeeNumber})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete employee"
        description={`Delete ${deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : 'this employee'}? This cannot be undone.`}
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
      />
    </>
  );
}
