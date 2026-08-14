import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { getClientMeta } from '../../utils/helpers';
import { projectsService } from './projects.service';
import { workItemsService } from './work-items.service';
import {
  activityQuerySchema,
  addMemberSchema,
  createCommentSchema,
  createProjectSchema,
  createWorkItemSchema,
  memberParamSchema,
  myWorkItemsQuerySchema,
  paginationSchema,
  updateProjectSchema,
  updateWorkItemSchema,
  uuidParamSchema,
} from './projects.schema';

const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get(
  '/lookups',
  requirePermission('projects.view'),
  asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, await projectsService.lookups()),
  ),
);

projectsRouter.get(
  '/mine',
  requirePermission('projects.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await projectsService.list(req.query as never, req.user!.id)),
  ),
);

projectsRouter.get(
  '/',
  requirePermission('projects.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await projectsService.list(req.query as never)),
  ),
);

projectsRouter.get(
  '/:id',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await projectsService.getById(req.params.id!)),
  ),
);

projectsRouter.post(
  '/',
  requirePermission('projects.create'),
  validateRequest(createProjectSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await projectsService.create(req.body, req.user!, getClientMeta(req)),
      201,
    ),
  ),
);

projectsRouter.patch(
  '/:id',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateProjectSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await projectsService.update(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

projectsRouter.delete(
  '/:id',
  requirePermission('projects.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await projectsService.remove(req.params.id!, req.user!, getClientMeta(req)),
    ),
  ),
);

projectsRouter.get(
  '/:id/members',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await projectsService.listMembers(req.params.id!)),
  ),
);

projectsRouter.post(
  '/:id/members',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(addMemberSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await projectsService.addMember(req.params.id!, req.body, req.user!), 201),
  ),
);

projectsRouter.delete(
  '/:id/members/:userId',
  requirePermission('projects.view'),
  validateRequest(memberParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await projectsService.removeMember(req.params.id!, req.params.userId!, req.user!),
    ),
  ),
);

projectsRouter.get(
  '/:id/work-items',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await workItemsService.listByProject(req.params.id!)),
  ),
);

projectsRouter.post(
  '/:id/work-items',
  requirePermission('work-items.create'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(createWorkItemSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await workItemsService.create(req.params.id!, req.body, req.user!, getClientMeta(req)),
      201,
    ),
  ),
);

projectsRouter.get(
  '/:id/activity',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(activityQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await projectsService.listActivity(req.params.id!, req.query as never),
    ),
  ),
);

const workItemsRouter = Router();
workItemsRouter.use(requireAuth);

workItemsRouter.get(
  '/mine',
  requirePermission('projects.view'),
  validateRequest(myWorkItemsQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await workItemsService.listMine(req.user!.id, req.query as never)),
  ),
);

workItemsRouter.get(
  '/:id',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await workItemsService.getById(req.params.id!)),
  ),
);

workItemsRouter.patch(
  '/:id',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateWorkItemSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await workItemsService.update(req.params.id!, req.body, req.user!, getClientMeta(req)),
    ),
  ),
);

workItemsRouter.delete(
  '/:id',
  requirePermission('work-items.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await workItemsService.remove(req.params.id!, req.user!, getClientMeta(req)),
    ),
  ),
);

workItemsRouter.get(
  '/:id/comments',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await workItemsService.listComments(req.params.id!)),
  ),
);

workItemsRouter.post(
  '/:id/comments',
  requirePermission('projects.view'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(createCommentSchema),
  asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await workItemsService.addComment(req.params.id!, req.body, req.user!), 201),
  ),
);

export { workItemsRouter };
export default projectsRouter;
