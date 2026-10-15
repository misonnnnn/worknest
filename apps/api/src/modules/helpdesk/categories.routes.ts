import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { getClientMeta } from '../../utils/helpers';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const categoriesService = {
  async list(activeOnly = false) {
    return prisma.iTTicketCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  async create(
    input: z.infer<typeof createSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const created = await prisma.iTTicketCategory.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isActive: input.isActive ?? true,
      },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'CREATE',
      resource: 'helpdesk-categories',
      resourceId: created.id,
      newValues: created,
      ...meta,
    });

    return created;
  },

  async update(
    id: string,
    input: z.infer<typeof updateSchema>,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.iTTicketCategory.findUnique({ where: { id } });
    if (!existing) throw notFound('Category not found');

    const updated = await prisma.iTTicketCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'helpdesk-categories',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
      ...meta,
    });

    return updated;
  },

  async deactivate(
    id: string,
    actorId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await prisma.iTTicketCategory.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });
    if (!existing) throw notFound('Category not found');

    // Soft-deactivate only — never hard-delete categories that may be referenced.
    if (existing._count.tickets > 0 && existing.isActive === false) {
      throw conflict('Category is already inactive');
    }

    const updated = await prisma.iTTicketCategory.update({
      where: { id },
      data: { isActive: false },
    });

    await writeAuditLog({
      userId: actorId,
      action: 'UPDATE',
      resource: 'helpdesk-categories',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
      ...meta,
    });

    return updated;
  },
};

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('helpdesk.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const canManage = Boolean(req.user?.permissions.includes('helpdesk.manage_categories'));
    // Non-managers only see active categories. Managers see all unless ?activeOnly=true.
    const activeOnly = canManage ? req.query.activeOnly === 'true' : true;
    sendSuccess(res, await categoriesService.list(activeOnly));
  }),
);

router.post(
  '/',
  requirePermission('helpdesk.manage_categories'),
  validateRequest(createSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await categoriesService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    ),
  ),
);

router.patch(
  '/:id',
  requirePermission('helpdesk.manage_categories'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await categoriesService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    ),
  ),
);

router.delete(
  '/:id',
  requirePermission('helpdesk.manage_categories'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await categoriesService.deactivate(req.params.id!, req.user!.id, getClientMeta(req)),
    ),
  ),
);

export default router;
