import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, SUPER_ADMIN_ROLE } from '../src/config/permissions';
import { ensureProjectCatalog } from '../src/modules/projects/catalog';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMeAdmin123!';

async function upsertPermissions() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }
}

async function upsertSuperAdminRole() {
  const permissions = await prisma.permission.findMany();
  const role = await prisma.role.upsert({
    where: { name: SUPER_ADMIN_ROLE },
    update: { description: 'Full system access' },
    create: { name: SUPER_ADMIN_ROLE, description: 'Full system access' },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  return role;
}

async function upsertCsrRole() {
  const crmPermissions = await prisma.permission.findMany({
    where: { key: { startsWith: 'crm.' } },
  });
  const role = await prisma.role.upsert({
    where: { name: 'CSR' },
    update: { description: 'Customer service / CRM access' },
    create: { name: 'CSR', description: 'Customer service / CRM access' },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: crmPermissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  return role;
}

async function upsertUser(email: string, roleId?: string) {
  const passwordHash = await argon2.hash(DEFAULT_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, isActive: true },
    create: { email: email.toLowerCase(), passwordHash, isActive: true },
  });

  if (roleId) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }

  return user;
}

async function seedOrgStructure() {
  const departments = [
    { name: 'Finance', code: 'FIN', description: 'Finance and accounting' },
    { name: 'Human Resources', code: 'HR', description: 'People operations and talent' },
    { name: 'ONLINE', code: 'ONL', description: 'Online operations' },
  ];

  const deptByCode: Record<string, { id: string }> = {};
  for (const dept of departments) {
    deptByCode[dept.code] = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, description: dept.description, isActive: true },
      create: dept,
    });
  }

  const positions = [
    { title: 'Chief Executive Officer', code: 'EXE-CEO', departmentId: null as string | null },
    {
      title: 'Customer Service Representative',
      code: 'CSR',
      departmentId: deptByCode.ONL!.id,
    },
    { title: 'HR Manager', code: 'HR-MGR', departmentId: deptByCode.HR!.id },
    { title: 'Software Engineer', code: 'ENG-SWE', departmentId: deptByCode.ONL!.id },
  ];

  const positionByCode: Record<string, { id: string }> = {};
  for (const position of positions) {
    positionByCode[position.code] = await prisma.position.upsert({
      where: { code: position.code },
      update: { title: position.title, departmentId: position.departmentId },
      create: position,
    });
  }

  const superAdminRole = await upsertSuperAdminRole();
  const csrRole = await upsertCsrRole();

  const adminUser = await upsertUser('admin@worknesterp.com', superAdminRole.id);
  const csrUser = await upsertUser('csr@worknesterp.com', csrRole.id);
  const johnUser = await upsertUser('johndoe@worknesterp.com');

  await prisma.employee.upsert({
    where: { employeeNumber: 'EMP-0001' },
    update: {
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@worknesterp.com',
      hireDate: new Date('2020-01-15'),
      employmentStatus: 'ACTIVE',
      departmentId: null,
      positionId: null,
      managerId: null,
      userId: adminUser.id,
    },
    create: {
      employeeNumber: 'EMP-0001',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@worknesterp.com',
      hireDate: new Date('2020-01-15'),
      employmentStatus: 'ACTIVE',
      userId: adminUser.id,
    },
  });

  await prisma.employee.upsert({
    where: { employeeNumber: 'EMP-0002' },
    update: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'johndoe@worknesterp.com',
      hireDate: new Date('2021-06-01'),
      employmentStatus: 'ACTIVE',
      departmentId: deptByCode.ONL!.id,
      positionId: positionByCode['ENG-SWE']!.id,
      managerId: null,
      userId: johnUser.id,
    },
    create: {
      employeeNumber: 'EMP-0002',
      firstName: 'John',
      lastName: 'Doe',
      email: 'johndoe@worknesterp.com',
      hireDate: new Date('2021-06-01'),
      employmentStatus: 'ACTIVE',
      departmentId: deptByCode.ONL!.id,
      positionId: positionByCode['ENG-SWE']!.id,
      userId: johnUser.id,
    },
  });

  await prisma.employee.upsert({
    where: { employeeNumber: 'EMP-0003' },
    update: {
      firstName: 'CSR',
      lastName: 'Agent',
      email: 'csr@worknesterp.com',
      hireDate: new Date('2022-03-10'),
      employmentStatus: 'ACTIVE',
      departmentId: deptByCode.ONL!.id,
      positionId: positionByCode.CSR!.id,
      managerId: null,
      userId: csrUser.id,
    },
    create: {
      employeeNumber: 'EMP-0003',
      firstName: 'CSR',
      lastName: 'Agent',
      email: 'csr@worknesterp.com',
      hireDate: new Date('2022-03-10'),
      employmentStatus: 'ACTIVE',
      departmentId: deptByCode.ONL!.id,
      positionId: positionByCode.CSR!.id,
      userId: csrUser.id,
    },
  });

  return adminUser;
}

async function seedProcurement() {
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: { name: 'Main Warehouse', isDefault: true, isActive: true },
    create: { code: 'MAIN', name: 'Main Warehouse', isDefault: true, isActive: true },
  });

  await prisma.warehouse.updateMany({
    where: { NOT: { id: warehouse.id } },
    data: { isDefault: false },
  });

  const products = [
    { sku: 'PEN-001', name: 'Office Pen', unit: 'pcs', description: 'Blue ballpoint pen' },
    { sku: 'PAPER-A4', name: 'A4 Copy Paper', unit: 'ream', description: '500 sheets' },
    { sku: 'USB-16G', name: 'USB Drive 16GB', unit: 'pcs', description: null },
  ];

  for (const product of products) {
    const sku = product.sku.trim().toUpperCase();
    await prisma.product.upsert({
      where: { sku },
      update: {
        name: product.name,
        unit: product.unit,
        description: product.description,
        trackInventory: true,
        isActive: true,
      },
      create: {
        sku,
        name: product.name,
        unit: product.unit,
        description: product.description,
        trackInventory: true,
        isActive: true,
      },
    });
  }

  await prisma.supplier.upsert({
    where: { code: 'SUP-001' },
    update: {
      name: 'Office Supplies Co',
      email: 'orders@officesupplies.local',
      phone: '+1-555-0100',
      isActive: true,
    },
    create: {
      code: 'SUP-001',
      name: 'Office Supplies Co',
      email: 'orders@officesupplies.local',
      phone: '+1-555-0100',
      isActive: true,
    },
  });
}

async function main() {
  console.log('Seeding WorkNest data...');
  await upsertPermissions();
  const admin = await seedOrgStructure();
  await seedProcurement();
  await ensureProjectCatalog(prisma);
  console.log('Seed completed.');
  console.log(`Admin: ${admin.email}`);
  console.log(`CSR: csr@worknesterp.com`);
  console.log(`Password (all seeded users): ${DEFAULT_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
