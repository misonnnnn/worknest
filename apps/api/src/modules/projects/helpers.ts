import type { AuthUser } from '@worknest/types';
import { prisma } from '../../lib/prisma';

export const userRefSelect = {
  id: true,
  email: true,
  employee: {
    select: {
      firstName: true,
      lastName: true,
      department: { select: { name: true } },
    },
  },
} as const;

type UserRefRecord = {
  id: string;
  email: string;
  employee: {
    firstName: string;
    lastName: string;
    department: { name: string } | null;
  } | null;
};

export function mapUserRef(user: UserRefRecord) {
  const displayName = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user.email;

  return {
    id: user.id,
    email: user.email,
    displayName,
    departmentName: user.employee?.department?.name ?? null,
  };
}

export function workItemKey(projectKey: string, number: number) {
  return `${projectKey}-${number}`;
}

export function suggestProjectKey(name: string) {
  const letters = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (letters.slice(0, 4) || 'PROJ').slice(0, 10);
}

export async function uniqueProjectKey(base: string) {
  let key = base.slice(0, 10);
  let n = 1;
  while (await prisma.project.findUnique({ where: { key } })) {
    const suffix = String(n++);
    key = `${base.slice(0, Math.max(1, 10 - suffix.length))}${suffix}`;
  }
  return key;
}

export function isProjectManager(userId: string, project: { projectManagerId: string }) {
  return project.projectManagerId === userId;
}

export function canManageProject(user: AuthUser, project: { projectManagerId: string }) {
  return user.permissions.includes('projects.manage') || isProjectManager(user.id, project);
}

export function canEditWorkItem(user: AuthUser, project: { projectManagerId: string }) {
  return user.permissions.includes('work-items.update') || isProjectManager(user.id, project);
}

export function canAssignWorkItem(user: AuthUser, project: { projectManagerId: string }) {
  return user.permissions.includes('work-items.assign') || canEditWorkItem(user, project);
}

export async function logActivity(input: {
  projectId: string;
  workItemId?: string | null;
  userId?: string | null;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await prisma.projectActivityLog.create({
    data: {
      projectId: input.projectId,
      workItemId: input.workItemId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
    },
  });
}

export function progressFromItems(items: Array<{ status: { isCompleted: boolean } }>) {
  const total = items.length;
  const completed = items.filter((item) => item.status.isCompleted).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
}
