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
import productsRoutes from '../modules/products/products.routes';
import suppliersRoutes from '../modules/suppliers/suppliers.routes';
import warehousesRoutes from '../modules/warehouses/warehouses.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import purchasingRoutes from '../modules/purchasing/purchasing.routes';
import requisitionsRoutes from '../modules/requisitions/requisitions.routes';
import typingTestsRoutes from '../modules/typing-tests/typing-tests.routes';
import numberMemoryRoutes from '../modules/number-memory/number-memory.routes';
import aiRoutes from '../modules/ai/ai.routes';

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
router.use('/products', productsRoutes);
router.use('/suppliers', suppliersRoutes);
router.use('/warehouses', warehousesRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/purchase-requisitions', requisitionsRoutes);
router.use('/purchase-orders', purchasingRoutes);
router.use('/typing-tests', typingTestsRoutes);
router.use('/number-memory', numberMemoryRoutes);
router.use('/ai', aiRoutes);

export default router;
