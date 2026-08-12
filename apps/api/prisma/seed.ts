import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, SUPER_ADMIN_ROLE } from '../src/config/permissions';

const prisma = new PrismaClient();

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
    update: {
      description: 'Full system access',
    },
    create: {
      name: SUPER_ADMIN_ROLE,
      description: 'Full system access',
    },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  return role;
}

async function upsertAdminUser(roleId: string) {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@worknest.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMeAdmin123!';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId } },
    update: {},
    create: { userId: user.id, roleId },
  });

  return user;
}

async function seedOrgStructure(adminUserId: string) {
  const departments = [
    {
      name: 'Human Resources',
      code: 'HR',
      description: 'People operations and talent',
    },
    {
      name: 'Engineering',
      code: 'ENG',
      description: 'Product engineering',
    },
    {
      name: 'Finance',
      code: 'FIN',
      description: 'Finance and accounting',
    },
  ];

  const deptRecords = [];
  for (const dept of departments) {
    deptRecords.push(
      await prisma.department.upsert({
        where: { code: dept.code },
        update: { name: dept.name, description: dept.description, isActive: true },
        create: dept,
      }),
    );
  }

  const [hr, eng, fin] = deptRecords;

  const positions = [
    { title: 'HR Manager', code: 'HR-MGR', departmentId: hr!.id },
    { title: 'Software Engineer', code: 'ENG-SWE', departmentId: eng!.id },
    { title: 'Finance Analyst', code: 'FIN-ANL', departmentId: fin!.id },
    { title: 'Chief Executive Officer', code: 'EXE-CEO', departmentId: null },
  ];

  const positionRecords = [];
  for (const position of positions) {
    positionRecords.push(
      await prisma.position.upsert({
        where: { code: position.code },
        update: {
          title: position.title,
          departmentId: position.departmentId,
        },
        create: position,
      }),
    );
  }

  const ceoPosition = positionRecords.find((p) => p.code === 'EXE-CEO')!;
  const engPosition = positionRecords.find((p) => p.code === 'ENG-SWE')!;
  const hrPosition = positionRecords.find((p) => p.code === 'HR-MGR')!;

  const ceo = await prisma.employee.upsert({
    where: { employeeNumber: 'EMP-0001' },
    update: {
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@worknest.local',
      hireDate: new Date('2020-01-15'),
      employmentStatus: 'ACTIVE',
      departmentId: eng!.id,
      positionId: ceoPosition.id,
      userId: adminUserId,
    },
    create: {
      employeeNumber: 'EMP-0001',
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@worknest.local',
      hireDate: new Date('2020-01-15'),
      employmentStatus: 'ACTIVE',
      departmentId: eng!.id,
      positionId: ceoPosition.id,
      userId: adminUserId,
    },
  });

  await prisma.employee.upsert({
    where: { employeeNumber: 'EMP-0002' },
    update: {
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan.lee@worknest.local',
      hireDate: new Date('2021-06-01'),
      employmentStatus: 'ACTIVE',
      departmentId: eng!.id,
      positionId: engPosition.id,
      managerId: ceo.id,
    },
    create: {
      employeeNumber: 'EMP-0002',
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan.lee@worknest.local',
      hireDate: new Date('2021-06-01'),
      employmentStatus: 'ACTIVE',
      departmentId: eng!.id,
      positionId: engPosition.id,
      managerId: ceo.id,
    },
  });

  await prisma.employee.upsert({
    where: { employeeNumber: 'EMP-0003' },
    update: {
      firstName: 'Sam',
      lastName: 'Patel',
      email: 'sam.patel@worknest.local',
      hireDate: new Date('2022-03-10'),
      employmentStatus: 'ACTIVE',
      departmentId: hr!.id,
      positionId: hrPosition.id,
      managerId: ceo.id,
    },
    create: {
      employeeNumber: 'EMP-0003',
      firstName: 'Sam',
      lastName: 'Patel',
      email: 'sam.patel@worknest.local',
      hireDate: new Date('2022-03-10'),
      employmentStatus: 'ACTIVE',
      departmentId: hr!.id,
      positionId: hrPosition.id,
      managerId: ceo.id,
    },
  });
}

async function seedProcurement() {
  // One default warehouse is enough for the beginner flow
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: { name: 'Main Warehouse', isDefault: true, isActive: true },
    create: { code: 'MAIN', name: 'Main Warehouse', isDefault: true, isActive: true },
  });

  // Clear default flag on any other warehouses
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
  const role = await upsertSuperAdminRole();
  const admin = await upsertAdminUser(role.id);
  await seedOrgStructure(admin.id);
  await seedProcurement();
  console.log('Seed completed.');
  console.log(`Admin: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
