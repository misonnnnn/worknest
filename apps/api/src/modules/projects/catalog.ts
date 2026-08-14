import type { PrismaClient } from '@prisma/client';

const PROJECT_STATUSES = [
  { name: 'Planning', description: 'Project is being planned', sortOrder: 1, isDefault: true },
  { name: 'Active', description: 'Project is in progress', sortOrder: 2, isDefault: false },
  { name: 'On Hold', description: 'Project is paused', sortOrder: 3, isDefault: false },
  { name: 'Completed', description: 'Project is finished', sortOrder: 4, isDefault: false },
  { name: 'Cancelled', description: 'Project was cancelled', sortOrder: 5, isDefault: false },
];

const WORK_ITEM_TYPES = [
  { name: 'Task', description: 'A general task', sortOrder: 1 },
  { name: 'Bug', description: 'A defect or issue', sortOrder: 2 },
  { name: 'Feature', description: 'A new feature', sortOrder: 3 },
  { name: 'Request', description: 'A request from another team', sortOrder: 4 },
  { name: 'Improvement', description: 'An enhancement to existing work', sortOrder: 5 },
];

const WORK_ITEM_STATUSES = [
  {
    name: 'Open',
    description: 'Not started',
    sortOrder: 1,
    isDefault: true,
    isCompleted: false,
  },
  {
    name: 'In Progress',
    description: 'Currently being worked on',
    sortOrder: 2,
    isDefault: false,
    isCompleted: false,
  },
  {
    name: 'In Review',
    description: 'Waiting for review',
    sortOrder: 3,
    isDefault: false,
    isCompleted: false,
  },
  {
    name: 'Done',
    description: 'Completed',
    sortOrder: 4,
    isDefault: false,
    isCompleted: true,
  },
  {
    name: 'Cancelled',
    description: 'Cancelled',
    sortOrder: 5,
    isDefault: false,
    isCompleted: false,
  },
];

/** Makes sure default project/work-item statuses and types exist. Safe to run on every startup. */
export async function ensureProjectCatalog(db: PrismaClient) {
  for (const status of PROJECT_STATUSES) {
    await db.projectStatus.upsert({
      where: { name: status.name },
      update: {
        description: status.description,
        sortOrder: status.sortOrder,
        isDefault: status.isDefault,
        isActive: true,
      },
      create: status,
    });
  }

  for (const type of WORK_ITEM_TYPES) {
    await db.workItemType.upsert({
      where: { name: type.name },
      update: {
        description: type.description,
        sortOrder: type.sortOrder,
        isActive: true,
      },
      create: type,
    });
  }

  for (const status of WORK_ITEM_STATUSES) {
    await db.workItemStatus.upsert({
      where: { name: status.name },
      update: {
        description: status.description,
        sortOrder: status.sortOrder,
        isDefault: status.isDefault,
        isCompleted: status.isCompleted,
        isActive: true,
      },
      create: status,
    });
  }
}
