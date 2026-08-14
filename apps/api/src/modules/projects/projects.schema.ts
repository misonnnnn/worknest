import { z } from 'zod';
import { ProjectMemberRole, WorkItemPriority } from '@prisma/client';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  statusId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

export const uuidParamSchema = z.object({ id: z.string().uuid() });

export const memberParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const projectKeySchema = z
  .string()
  .min(2)
  .max(10)
  .regex(/^[A-Z][A-Z0-9]*$/, 'Project key must be uppercase letters/numbers, starting with a letter');

const optionalDate = z.preprocess((value) => {
  if (value === '') return null;
  return value;
}, z.coerce.date().nullable().optional());

export const createProjectSchema = z
  .object({
    name: z.string().min(2).max(150),
    key: projectKeySchema.optional(),
    description: z.string().max(2000).optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    projectManagerId: z.string().uuid(),
    statusId: z.string().uuid().optional(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) return data.endDate >= data.startDate;
      return true;
    },
    { message: 'End date must be on or after start date', path: ['endDate'] },
  );

export const updateProjectSchema = z
  .object({
    name: z.string().min(2).max(150).optional(),
    key: projectKeySchema.optional(),
    description: z.string().max(2000).optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    projectManagerId: z.string().uuid().optional(),
    statusId: z.string().uuid().optional(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) return data.endDate >= data.startDate;
      return true;
    },
    { message: 'End date must be on or after start date', path: ['endDate'] },
  );

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(ProjectMemberRole).optional().default(ProjectMemberRole.MEMBER),
});

export const createWorkItemSchema = z.object({
  typeId: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().nullable(),
  statusId: z.string().uuid().optional(),
  priority: z.nativeEnum(WorkItemPriority).optional().default(WorkItemPriority.MEDIUM),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: optionalDate,
});

export const updateWorkItemSchema = z.object({
  typeId: z.string().uuid().optional(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  statusId: z.string().uuid().optional(),
  priority: z.nativeEnum(WorkItemPriority).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: optionalDate,
});

export const createCommentSchema = z.object({
  comment: z.string().min(1).max(4000),
});

export const myWorkItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  statusId: z.string().uuid().optional(),
});

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const catalogItemSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
});
