import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import permissionsRoutes from '../modules/permissions/permissions.routes';
import departmentsRoutes from '../modules/departments/departments.routes';
import positionsRoutes from '../modules/positions/positions.routes';
import employeesRoutes from '../modules/employees/employees.routes';
import auditLogsRoutes from '../modules/audit-logs/audit-logs.routes';
import mediaRoutes from '../modules/media/media.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/departments', departmentsRoutes);
router.use('/positions', positionsRoutes);
router.use('/employees', employeesRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/media', mediaRoutes);

export default router;
