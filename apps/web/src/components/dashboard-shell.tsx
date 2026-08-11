'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Shield,
  KeyRound,
  Building2,
  Briefcase,
  UserRound,
  ScrollText,
  Menu,
  LogOut,
  ChevronsUpDown,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users, permission: 'users.view' },
  { href: '/roles', label: 'Roles', icon: Shield, permission: 'roles.view' },
  { href: '/permissions', label: 'Permissions', icon: KeyRound, permission: 'permissions.view' },
  { href: '/departments', label: 'Departments', icon: Building2, permission: 'departments.view' },
  { href: '/positions', label: 'Positions', icon: Briefcase, permission: 'positions.view' },
  { href: '/employees', label: 'Employees', icon: UserRound, permission: 'employees.view' },
  { href: '/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit-logs.view' },
];

function NavItems({
  items,
  pathname,
  onNavigate,
}: {
  items: typeof NAV;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
              active
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  const items = useMemo(
    () => NAV.filter((item) => !item.permission || can(item.permission)),
    [can],
  );

  const crumbs = pathname.split('/').filter(Boolean);
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'WN';

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-12 items-center px-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            WorkNest
          </Link>
        </div>
        <Separator />
        <div className="flex-1 overflow-y-auto py-3">
          <NavItems items={items} pathname={pathname} />
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[220px] p-0">
          <SheetHeader className="h-12 justify-center border-b px-4 text-left">
            <SheetTitle className="text-sm font-semibold">WorkNest</SheetTitle>
          </SheetHeader>
          <div className="py-3">
            <NavItems items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b bg-background px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {crumbs.map((crumb, index) => (
                  <span key={crumb} className="contents">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {index === crumbs.length - 1 ? (
                        <BreadcrumbPage className="capitalize">
                          {crumb.replace('-', ' ')}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild className="capitalize">
                          <Link href={`/${crumbs.slice(0, index + 1).join('/')}`}>
                            {crumb.replace('-', ' ')}
                          </Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-1.5">
                <Avatar size="sm">
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[160px] truncate text-xs sm:inline">{user.email}</span>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="truncate text-sm font-medium">{user.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {user.roles.map((r) => r.name).join(', ') || 'No roles'}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await logout();
                  router.replace('/login');
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="px-3 py-5 sm:px-5">{children}</main>
      </div>
    </div>
  );
}
