import { Router } from 'express';
import { usersController } from './users.controller';
import {
  assignRolesSchema,
  createUserSchema,
  paginationSchema,
  updateUserSchema,
  uuidParamSchema,
} from './users.schema';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  requirePermission('users.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(usersController.list),
);

router.get(
  '/:id',
  requirePermission('users.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(usersController.get),
);

router.post(
  '/',
  requirePermission('users.create'),
  validateRequest(createUserSchema),
  asyncHandler(usersController.create),
);

router.patch(
  '/:id',
  requirePermission('users.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateUserSchema),
  asyncHandler(usersController.update),
);

router.delete(
  '/:id',
  requirePermission('users.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(usersController.remove),
);

router.put(
  '/:id/roles',
  requirePermission('roles.assign'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(assignRolesSchema),
  asyncHandler(usersController.assignRoles),
);

export default router;
