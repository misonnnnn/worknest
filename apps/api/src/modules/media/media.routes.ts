import multer from 'multer';
import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { mediaService } from './media.service';
import {
  createFolderSchema,
  fileListQuerySchema,
  folderListQuerySchema,
  searchQuerySchema,
  transferSchema,
  updateFileSchema,
  updateFolderSchema,
  uuidParamSchema,
} from './media.schema';
import { ALLOWED_IMAGE_TYPES, deleteStoredFile, saveUploadedFile } from './media.storage';
import { writeAuditLog } from '../../lib/audit';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { getClientMeta } from '../../utils/helpers';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
});

const router = Router();
router.use(requireAuth);

router.get(
  '/folders',
  requirePermission('media.view'),
  validateRequest(folderListQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof folderListQuerySchema>;
    if (query.all) {
      return sendSuccess(res, await mediaService.listAllFolders());
    }
    return sendSuccess(res, await mediaService.listFolders(query.parent_id));
  }),
);

router.post(
  '/folders',
  requirePermission('media.create'),
  validateRequest(createFolderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createFolderSchema>;
    const folder = await mediaService.createFolder({
      name: body.name,
      parentId: body.parent_id ?? null,
      sortOrder: body.sort_order,
    });
    await writeAuditLog({
      userId: req.user!.id,
      action: 'CREATE',
      resource: 'media-folders',
      resourceId: folder.id,
      newValues: folder,
      ...getClientMeta(req),
    });
    return sendSuccess(res, folder, 201);
  }),
);

router.patch(
  '/folders/:id',
  requirePermission('media.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateFolderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof updateFolderSchema>;
    const folder = await mediaService.updateFolder(req.params.id!, {
      name: body.name,
      parentId: body.parent_id,
      sortOrder: body.sort_order,
    });
    await writeAuditLog({
      userId: req.user!.id,
      action: 'UPDATE',
      resource: 'media-folders',
      resourceId: folder.id,
      newValues: folder,
      ...getClientMeta(req),
    });
    return sendSuccess(res, folder);
  }),
);

router.delete(
  '/folders/:id',
  requirePermission('media.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await mediaService.deleteFolder(req.params.id!);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'DELETE',
      resource: 'media-folders',
      resourceId: req.params.id!,
      ...getClientMeta(req),
    });
    return sendSuccess(res, result);
  }),
);

router.post(
  '/folders/copy',
  requirePermission('media.create'),
  validateRequest(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof transferSchema>;
    const folder = await mediaService.copyFolderToParent(body.source_id, body.parent_id ?? null);
    return sendSuccess(res, folder, 201);
  }),
);

router.post(
  '/folders/move',
  requirePermission('media.update'),
  validateRequest(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof transferSchema>;
    const folder = await mediaService.moveFolderToParent(body.source_id, body.parent_id ?? null);
    return sendSuccess(res, folder);
  }),
);

router.get(
  '/files',
  requirePermission('media.view'),
  validateRequest(fileListQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof fileListQuerySchema>;
    return sendSuccess(res, await mediaService.listFiles(query.folder_id));
  }),
);

router.post(
  '/files',
  requirePermission('media.create'),
  upload.array('files', 20),
  asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'At least one image file is required' },
      });
    }

    const folderId =
      typeof req.body.folder_id === 'string' && req.body.folder_id.trim()
        ? req.body.folder_id.trim()
        : null;

    if (folderId) await mediaService.getFolder(folderId);

    const created = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: `Only image files are allowed (jpeg, png, webp, gif). Bad file: ${file.originalname}`,
          },
        });
      }

      const stored = await saveUploadedFile(file.originalname, file.buffer, file.mimetype);
      try {
        const uniqueName = await mediaService.getUniqueFileNameForUpload(file.originalname, folderId);
        const mediaFile = await mediaService.createFile({
          name: uniqueName,
          folderId,
          storageKey: stored.storageKey,
          mimeType: file.mimetype,
          size: file.size,
        });

        await writeAuditLog({
          userId: req.user!.id,
          action: 'CREATE',
          resource: 'media-files',
          resourceId: mediaFile.id,
          newValues: { name: mediaFile.name, folderId: mediaFile.folderId },
          ...getClientMeta(req),
        });

        created.push(mediaFile);
      } catch (err) {
        try {
          await deleteStoredFile(stored.storageKey);
        } catch (cleanupErr) {
          console.error('Failed to roll back uploaded R2 object:', cleanupErr);
        }
        throw err;
      }
    }

    return sendSuccess(res, { files: created, count: created.length }, 201);
  }),
);

router.get(
  '/files/:id/download',
  requirePermission('media.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const file = await mediaService.getFile(req.params.id!);
    return sendSuccess(res, { url: file.url });
  }),
);

router.patch(
  '/files/:id',
  requirePermission('media.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateFileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof updateFileSchema>;
    const file = await mediaService.updateFile(req.params.id!, {
      name: body.name,
      folderId: body.folder_id,
      alt: body.alt,
    });
    return sendSuccess(res, file);
  }),
);

router.delete(
  '/files/:id',
  requirePermission('media.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await mediaService.deleteFile(req.params.id!);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'DELETE',
      resource: 'media-files',
      resourceId: req.params.id!,
      ...getClientMeta(req),
    });
    return sendSuccess(res, result);
  }),
);

router.post(
  '/files/copy',
  requirePermission('media.create'),
  validateRequest(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof transferSchema>;
    const file = await mediaService.copyFileToFolder(body.source_id, body.folder_id ?? null);
    return sendSuccess(res, file, 201);
  }),
);

router.post(
  '/files/move',
  requirePermission('media.update'),
  validateRequest(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof transferSchema>;
    const file = await mediaService.moveFileToFolder(body.source_id, body.folder_id ?? null);
    return sendSuccess(res, file);
  }),
);

router.get(
  '/search',
  requirePermission('media.view'),
  validateRequest(searchQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof searchQuerySchema>;
    return sendSuccess(res, await mediaService.search(query.q, query.folder_id));
  }),
);

export default router;
