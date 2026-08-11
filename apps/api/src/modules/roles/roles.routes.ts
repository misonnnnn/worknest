import { Router } from 'express';
import { rolesController } from './roles.controller';
import {
  createRoleSchema,
  paginationSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
  uuidParamSchema,
} from './roles.schema';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth, requirePermission } from '../../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('roles.view'),
  validateRequest(paginationSchema, 'query'),
  asyncHandler(rolesController.list),
);
router.get(
  '/:id',
  requirePermission('roles.view'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(rolesController.get),
);
router.post(
  '/',
  requirePermission('roles.create'),
  validateRequest(createRoleSchema),
  asyncHandler(rolesController.create),
);
router.patch(
  '/:id',
  requirePermission('roles.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateRoleSchema),
  asyncHandler(rolesController.update),
);
router.delete(
  '/:id',
  requirePermission('roles.delete'),
  validateRequest(uuidParamSchema, 'params'),
  asyncHandler(rolesController.remove),
);
router.put(
  '/:id/permissions',
  requirePermission('roles.update'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(setRolePermissionsSchema),
  asyncHandler(rolesController.setPermissions),
);

export default router;
