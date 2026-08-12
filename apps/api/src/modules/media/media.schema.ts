import { z } from 'zod';

export const optionalUuidQuery = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

export const folderListQuerySchema = z.object({
  parent_id: optionalUuidQuery,
  all: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export const fileListQuerySchema = z.object({
  folder_id: optionalUuidQuery,
});

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  folder_id: optionalUuidQuery,
});

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: optionalUuidQuery.optional(),
  sort_order: z.number().int().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parent_id: optionalUuidQuery.optional(),
  sort_order: z.number().int().optional(),
});

export const updateFileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folder_id: optionalUuidQuery.optional(),
  alt: z.string().max(500).nullable().optional(),
});

export const transferSchema = z.object({
  source_id: z.string().uuid(),
  parent_id: optionalUuidQuery.optional(),
  folder_id: optionalUuidQuery.optional(),
});

export const uuidParamSchema = z.object({ id: z.string().uuid() });
