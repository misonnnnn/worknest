export type UserRef = {
  id: string;
  email: string;
  displayName: string;
  departmentName: string | null;
};

export type CatalogStatus = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isDefault?: boolean;
  isCompleted?: boolean;
  isActive: boolean;
};

export type WorkItemTypeOption = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type ProjectLookups = {
  departments: Array<{ id: string; name: string; code: string }>;
  users: UserRef[];
  projectStatuses: CatalogStatus[];
  workItemTypes: WorkItemTypeOption[];
  workItemStatuses: CatalogStatus[];
};

export type ProjectProgress = {
  total: number;
  completed: number;
  percent: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  department: { id: string; name: string; code: string } | null;
  status: CatalogStatus;
  projectManager: UserRef;
  createdBy: UserRef;
  progress: ProjectProgress;
};

export type ProjectMember = {
  id: string;
  role: 'PROJECT_MANAGER' | 'MEMBER' | 'OBSERVER';
  createdAt: string;
  user: UserRef;
};

export type ProjectDetail = ProjectRow & {
  members: ProjectMember[];
};

export type WorkItemRow = {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; key: string; projectManagerId: string };
  type: { id: string; name: string };
  status: CatalogStatus;
  reporter: UserRef;
  assignee: UserRef | null;
};

export type WorkItemComment = {
  id: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  user: UserRef;
};

export type ActivityLog = {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: UserRef | null;
  workItem: { id: string; key: string; title: string } | null;
};

export const NONE = '__none__';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const MEMBER_ROLES = ['PROJECT_MANAGER', 'MEMBER', 'OBSERVER'] as const;

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return value.slice(0, 10);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
  };
  return labels[priority] ?? priority;
}

export function memberRoleLabel(role: string) {
  const labels: Record<string, string> = {
    PROJECT_MANAGER: 'Project Manager',
    MEMBER: 'Member',
    OBSERVER: 'Observer',
  };
  return labels[role] ?? role;
}

export function activityLabel(action: string) {
  const labels: Record<string, string> = {
    'project.created': 'created the project',
    'project.status_changed': 'changed project status',
    'work_item.created': 'created a work item',
    'work_item.assigned': 'assigned a work item',
    'work_item.status_changed': 'changed work item status',
    'work_item.completed': 'completed a work item',
    'comment.added': 'added a comment',
    'member.added': 'added a project member',
    'member.removed': 'removed a project member',
  };
  return labels[action] ?? action;
}

export function userLine(user: UserRef | null | undefined) {
  if (!user) return 'Unassigned';
  return user.departmentName ? `${user.displayName} — ${user.departmentName}` : user.displayName;
}

export function suggestKeyFromName(name: string) {
  const letters = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (letters.slice(0, 4) || 'PROJ').slice(0, 10);
}

export const textareaClassName =
  'min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30';
