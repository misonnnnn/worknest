'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

async function safeCount(path: string) {
  try {
    const data = await apiRequest<{ total: number }>(path, { query: { page: 1, pageSize: 1 } });
    return data.total;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    void (async () => {
      const next: Record<string, number | null> = {};
      if (can('users.view')) next.users = await safeCount('/users');
      if (can('employees.view')) next.employees = await safeCount('/employees');
      if (can('departments.view')) next.departments = await safeCount('/departments');
      if (can('roles.view')) next.roles = await safeCount('/roles');
      setCounts(next);
    })();
  }, [can]);

  const cards = [
    { key: 'users', label: 'Users', permission: 'users.view' },
    { key: 'employees', label: 'Employees', permission: 'employees.view' },
    { key: 'departments', label: 'Departments', permission: 'departments.view' },
    { key: 'roles', label: 'Roles', permission: 'roles.view' },
  ].filter((c) => can(c.permission));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.employee ? `, ${user.employee.firstName}` : ''}.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.key} className="shadow-none">
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{counts[card.key] ?? '—'}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="mt-4 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm">Your access</CardTitle>
          <CardDescription>
            Sidebar modules are filtered by permissions. API authorization is enforced on every
            request.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {user?.permissions.slice(0, 12).map((p: string) => (
            <Badge key={p} variant="outline" className="mono rounded-md font-normal">
              {p}
            </Badge>
          ))}
          {(user?.permissions.length ?? 0) > 12 ? (
            <span className="text-xs text-muted-foreground">
              +{user!.permissions.length - 12} more
            </span>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
