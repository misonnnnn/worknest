import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  isActive: z.boolean().optional().default(true),
  roleIds: z.array(z.string().uuid()).optional().default([]),
  employeeId: z.string().uuid().nullable().optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
  employeeId: z.string().uuid().nullable().optional(),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});
