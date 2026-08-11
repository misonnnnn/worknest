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

type UserRow = {
  id: string;
  email: string;
  isActive: boolean;
  roles: Array<{ id: string; name: string }>;
  lastLoginAt: string | null;
};

export default function UsersPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/users', { method: 'POST', body: { email, password } });
      setOpen(false);
      setEmail('');
      setPassword('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

  return (
    <>
      <ResourceListPage<UserRow>
        key={reloadKey}
        title="Users"
        description="Manage application users and their access."
        endpoint="/users"
        permission="users.view"
        canCreate={can('users.create')}
        createLabel="New user"
        onCreate={() => setOpen(true)}
        columns={[
          { key: 'email', header: 'Email', render: (u) => u.email },
          {
            key: 'roles',
            header: 'Roles',
            render: (u) => u.roles.map((r) => r.name).join(', ') || '—',
          },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge active={u.isActive} /> },
          {
            key: 'lastLoginAt',
            header: 'Last login',
            render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'),
          },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreate}>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
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
