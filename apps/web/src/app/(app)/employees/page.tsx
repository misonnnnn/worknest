'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { EmploymentStatus, PaginatedResult } from '@worknest/types';
import { ResourceListPage } from '@/components/resource-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowActions } from '@/components/row-actions';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, apiUpload, ApiClientError, mediaUrl } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
type UserOption = { id: string; email: string; employee: { id: string } | null };
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
  userId: string | null;
  photoUrl: string | null;
  department: { id: string; name: string } | null;
  position: { id: string; title: string } | null;
  manager: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
  user: { id: string; email: string } | null;
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
  userId: string;
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
  userId: NONE,
};

function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function EmployeesPage() {
  const { can, user: me } = useAuth();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [viewing, setViewing] = useState<EmployeeRow | null>(null);

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
        const [deptData, positionData, employeeData, userData] = await Promise.all([
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
          can('users.view')
            ? apiRequest<PaginatedResult<UserOption>>('/users', {
                query: { page: 1, pageSize: 100 },
              })
            : Promise.resolve({ items: [] as UserOption[] }),
        ]);
        setDepartments(deptData.items);
        setPositions(positionData.items);
        setManagers(employeeData.items);
        setUsers(userData.items);
      } catch {
        setDepartments([]);
        setPositions([]);
        setManagers([]);
        setUsers([]);
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
      userId: employee.userId ?? employee.user?.id ?? NONE,
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
        userId: form.userId === NONE ? null : form.userId,
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

  function canManagePhoto(employee: EmployeeRow) {
    return me?.employee?.id === employee.id || can('employees.update');
  }

  async function onUploadPhoto(file: File) {
    if (!viewing) return;
    setPhotoSaving(true);
    setPhotoError(null);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const updated = await apiUpload<EmployeeRow>(`/employees/${viewing.id}/photo`, formData);
      setViewing(updated);
      refresh();
    } catch (err) {
      setPhotoError(err instanceof ApiClientError ? err.message : 'Failed to upload photo');
    } finally {
      setPhotoSaving(false);
    }
  }

  async function onRemovePhoto() {
    if (!viewing) return;
    setPhotoSaving(true);
    setPhotoError(null);
    try {
      const updated = await apiRequest<EmployeeRow>(`/employees/${viewing.id}/photo`, {
        method: 'DELETE',
      });
      setViewing(updated);
      refresh();
    } catch (err) {
      setPhotoError(err instanceof ApiClientError ? err.message : 'Failed to remove photo');
    } finally {
      setPhotoSaving(false);
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
            key: 'photo',
            header: '',
            className: 'w-[1%] pr-0',
            render: (e) => (
              <Avatar size="md">
                {e.photoUrl ? (
                  <AvatarImage src={mediaUrl(e.photoUrl)} alt="" />
                ) : null}
                <AvatarFallback>
                  {`${e.firstName[0] ?? ''}${e.lastName[0] ?? ''}`.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ),
          },
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
          {
            key: 'user',
            header: 'Login',
            render: (e) => e.user?.email || '—',
          },
        ]}
        actions={(employee) => (
          <RowActions
            actions={[
              { label: 'View', onClick: () => setViewing(employee) },
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

            {can('users.view') ? (
              <div className="space-y-1.5">
                <Label>Linked user account</Label>
                <Select
                  value={form.userId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, userId: value ?? NONE }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No login account</SelectItem>
                    {users
                      .filter(
                        (user) => !user.employee || user.employee.id === editing?.id,
                      )
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

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

      <Dialog
        open={Boolean(viewing)}
        onOpenChange={(open) => {
          if (!open) {
            setViewing(null);
            setPhotoError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {viewing ? `${viewing.firstName} ${viewing.lastName}` : 'Employee'}
            </DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-16 rounded-lg">
                  {viewing.photoUrl ? (
                    <AvatarImage src={mediaUrl(viewing.photoUrl)} alt={viewing.firstName} />
                  ) : null}
                  <AvatarFallback className="rounded-lg text-base">
                    {`${viewing.firstName[0] ?? ''}${viewing.lastName[0] ?? ''}`.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {canManagePhoto(viewing) ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Display picture</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onUploadPhoto(file);
                          e.target.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={photoSaving}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {photoSaving ? 'Saving…' : viewing.photoUrl ? 'Change photo' : 'Upload photo'}
                      </Button>
                      {viewing.photoUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={photoSaving}
                          onClick={() => void onRemovePhoto()}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    {photoError ? <p className="text-xs text-destructive">{photoError}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      {me?.employee?.id === viewing.id
                        ? 'You can update your own display picture.'
                        : 'HR can update this employee photo.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Display picture</p>
                )}
              </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Employee #</dt>
                <dd className="mono font-medium">{viewing.employeeNumber}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="secondary" className="rounded-md font-normal">
                    {viewing.employmentStatus}
                  </Badge>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">
                  {[viewing.firstName, viewing.middleName, viewing.lastName]
                    .filter(Boolean)
                    .join(' ')}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{viewing.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{viewing.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date of birth</dt>
                <dd>{viewing.dateOfBirth ? toDateInput(viewing.dateOfBirth) : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hire date</dt>
                <dd>{toDateInput(viewing.hireDate) || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Department</dt>
                <dd>{viewing.department?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Position</dt>
                <dd>{viewing.position?.title || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Manager</dt>
                <dd>
                  {viewing.manager
                    ? `${viewing.manager.firstName} ${viewing.manager.lastName}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Login account</dt>
                <dd>{viewing.user?.email || 'Not linked'}</dd>
              </div>
            </dl>
            </div>
          ) : null}
          <DialogFooter>
            {viewing && can('employees.update') ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  openEdit(viewing);
                  setViewing(null);
                }}
              >
                Edit
              </Button>
            ) : null}
            <Button type="button" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
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
