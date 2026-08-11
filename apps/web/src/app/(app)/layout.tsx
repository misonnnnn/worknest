'use client';

import { AuthProvider } from '@/components/auth-provider';
import { DashboardShell } from '@/components/dashboard-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
