'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ScrollText,
  LogOut,
  ChevronsUpDown,
  ChevronRight,
  Layers,
  ShieldCheck,
  Building,
  FolderKanban,
  FolderOpen,
  Package,
  Gamepad2,
  Keyboard,
  Brain,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';

type NavLink = {
  title: string;
  href: string;
  permission?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: NavLink[];
};

type NavSection = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavLink[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Access Control',
    icon: ShieldCheck,
    items: [
      { title: 'Users', href: '/users', permission: 'users.view' },
      { title: 'Roles', href: '/roles', permission: 'roles.view' },
      { title: 'Permissions', href: '/permissions', permission: 'permissions.view' },
    ],
  },
  {
    title: 'Organization',
    icon: Building,
    items: [
      { title: 'Departments', href: '/departments', permission: 'departments.view' },
      { title: 'Positions', href: '/positions', permission: 'positions.view' },
      { title: 'Employees', href: '/employees', permission: 'employees.view' },
    ],
  },
  {
    title: 'Operations',
    icon: Package,
    items: [
      { title: 'Products', href: '/products', permission: 'products.view' },
      { title: 'Suppliers', href: '/suppliers', permission: 'suppliers.view' },
      { title: 'Warehouses', href: '/warehouses', permission: 'warehouses.view' },
      { title: 'Inventory', href: '/inventory', permission: 'inventory.view' },
      { title: 'Requisitions', href: '/purchase-requisitions', permission: 'requisitions.view' },
      { title: 'Purchase Orders', href: '/purchase-orders', permission: 'purchasing.view' },
    ],
  },
  {
    title: 'Project Management',
    icon: FolderKanban,
    items: [
      { title: 'Projects', href: '/projects', permission: 'projects.view' },
      { title: 'My Projects', href: '/my-projects', permission: 'projects.view' },
      { title: 'My Work Items', href: '/my-work-items', permission: 'projects.view' },
    ],
  },
  {
    title: 'Games',
    icon: Gamepad2,
    items: [
      {
        title: 'Typing Test',
        href: '/typing-test',
        permission: 'typing-tests.view',
        icon: Keyboard,
        children: [
          { title: 'Play', href: '/typing-test', permission: 'typing-tests.view' },
          { title: 'Leaderboard', href: '/typing-test/leaderboard', permission: 'typing-tests.view' },
          { title: 'My Statistics', href: '/typing-test/statistics', permission: 'typing-tests.view' },
        ],
      },
      {
        title: 'Number Memory',
        href: '/number-memory',
        permission: 'number-memory.view',
        icon: Brain,
        children: [
          { title: 'Play', href: '/number-memory', permission: 'number-memory.view' },
          { title: 'Leaderboard', href: '/number-memory/leaderboard', permission: 'number-memory.view' },
        ],
      },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isExactPath(pathname: string, href: string) {
  return pathname === href;
}

function itemIsActive(pathname: string, item: NavLink): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isActivePath(pathname, child.href));
  }
  return isActivePath(pathname, item.href);
}

function sectionHasActiveItem(pathname: string, items: NavLink[]) {
  return items.some((item) => itemIsActive(pathname, item));
}

function filterNavItems(items: NavLink[], can: (p: string) => boolean): NavLink[] {
  return items
    .map((item) => {
      if (item.permission && !can(item.permission)) return null;
      if (item.children?.length) {
        const children = filterNavItems(item.children, can);
        if (children.length === 0) return null;
        return { ...item, children };
      }
      return item;
    })
    .filter((item): item is NavLink => item !== null);
}

function OrgSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Layers className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">WorkNest</span>
                <span className="truncate text-xs text-muted-foreground">Enterprise</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organization
            </DropdownMenuLabel>
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border">
                <Layers className="size-3.5 shrink-0" />
              </div>
              WorkNest
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'WN';

  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.email.split('@')[0]}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="bottom"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.email.split('@')[0]}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {user.roles.map((role) => role.name).join(', ') || 'No roles assigned'}
            </DropdownMenuItem>
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NestedNavItem({ item, pathname }: { item: NavLink; pathname: string }) {
  const hasChildren = Boolean(item.children?.length);
  const Icon = item.icon;

  if (!hasChildren) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={isActivePath(pathname, item.href)}>
          <Link href={item.href}>
            {Icon ? <Icon /> : null}
            <span>{item.title}</span>
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <Collapsible asChild defaultOpen className="group/game">
      <SidebarMenuSubItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuSubButton
            className="cursor-pointer"
            isActive={itemIsActive(pathname, item)}
          >
            {Icon ? <Icon /> : null}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/game:rotate-90" />
          </SidebarMenuSubButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="ml-2 border-l border-sidebar-border pl-2">
            {item.children!.map((child) => {
              // Exact match for Play (/typing-test) so Leaderboard doesn't highlight Play too
              const active =
                child.href === item.href
                  ? isExactPath(pathname, child.href)
                  : isActivePath(pathname, child.href);

              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link href={child.href}>
                      <span>{child.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { can } = useAuth();

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: filterNavItems(section.items, can),
  })).filter((section) => section.items.length > 0);

  const showAuditLogs = can('audit-logs.view');
  const showFileManager = can('media.view');

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActivePath(pathname, '/dashboard')}
                  tooltip="Dashboard"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleSections.map((section) => {
          const Icon = section.icon;
          const isOpen = sectionHasActiveItem(pathname, section.items);

          return (
            <SidebarGroup key={section.title}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible asChild defaultOpen={isOpen} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={section.title}>
                          <Icon />
                          <span>{section.title}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {section.items.map((item) => (
                            <NestedNavItem key={item.href + item.title} item={item} pathname={pathname} />
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        {showAuditLogs || showFileManager ? (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {showFileManager ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, '/file-manager')}
                      tooltip="File Manager"
                    >
                      <Link href="/file-manager">
                        <FolderOpen />
                        <span>File Manager</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {showAuditLogs ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, '/audit-logs')}
                      tooltip="Audit Logs"
                    >
                      <Link href="/audit-logs">
                        <ScrollText />
                        <span>Audit Logs</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
