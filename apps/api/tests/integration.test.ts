import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { PERMISSIONS, SUPER_ADMIN_ROLE } from '../src/config/permissions';

const app = createApp();

async function ensureSeed() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: permission,
    });
  }

  const permissions = await prisma.permission.findMany();
  const role = await prisma.role.upsert({
    where: { name: SUPER_ADMIN_ROLE },
    update: {},
    create: { name: SUPER_ADMIN_ROLE, description: 'Full access' },
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  const limitedRole = await prisma.role.upsert({
    where: { name: 'Viewer' },
    update: {},
    create: { name: 'Viewer', description: 'Limited view' },
  });

  const viewUsers = permissions.find((p) => p.key === 'users.view');
  if (viewUsers) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: limitedRole.id, permissionId: viewUsers.id },
      },
      update: {},
      create: { roleId: limitedRole.id, permissionId: viewUsers.id },
    });
  }

  const adminEmail = 'test-admin@worknest.local';
  const viewerEmail = 'test-viewer@worknest.local';
  const passwordHash = await hashPassword('TestPass123!');

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, isActive: true },
    create: { email: adminEmail, passwordHash, isActive: true },
  });

  const viewer = await prisma.user.upsert({
    where: { email: viewerEmail },
    update: { passwordHash, isActive: true },
    create: { email: viewerEmail, passwordHash, isActive: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: role.id } },
    update: {},
    create: { userId: admin.id, roleId: role.id },
  });

  await prisma.userRole.deleteMany({ where: { userId: viewer.id } });
  await prisma.userRole.create({
    data: { userId: viewer.id, roleId: limitedRole.id },
  });

  return { adminEmail, viewerEmail, password: 'TestPass123!', adminId: admin.id };
}

describe('API integration', () => {
  let adminToken = '';
  let viewerToken = '';
  let adminId = '';
  let creds: Awaited<ReturnType<typeof ensureSeed>>;

  beforeAll(async () => {
    creds = await ensureSeed();
    adminId = creds.adminId;

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: creds.adminEmail,
      password: creds.password,
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.accessToken;

    const viewerLogin = await request(app).post('/api/auth/login').send({
      email: creds.viewerEmail,
      password: creds.password,
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.data.accessToken;
  });

  it('authenticates and returns current user', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(me.status).toBe(200);
    expect(me.body.success).toBe(true);
    expect(me.body.data.email).toBe(creds.adminEmail);
    expect(me.body.data.permissions).toContain('employees.create');
  });

  it('rejects unauthorized access', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('enforces permission checks', async () => {
    const forbidden = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        employeeNumber: 'EMP-TEST-1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test.user@worknest.local',
        hireDate: '2024-01-01',
      });

    expect(forbidden.status).toBe(403);
  });

  it('creates an employee and writes an audit log', async () => {
    const create = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeNumber: `EMP-T-${Date.now()}`,
        firstName: 'Casey',
        lastName: 'Nguyen',
        email: `casey.${Date.now()}@worknest.local`,
        hireDate: '2024-05-01',
      });

    expect(create.status).toBe(201);
    expect(create.body.data.firstName).toBe('Casey');

    const logs = await request(app)
      .get('/api/audit-logs?resource=employees&action=CREATE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(logs.status).toBe(200);
    expect(logs.body.data.items.length).toBeGreaterThan(0);
  });

  it('assigns roles to a user', async () => {
    const roles = await request(app)
      .get('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(roles.status).toBe(200);
    const viewerRole = roles.body.data.items.find(
      (r: { name: string }) => r.name === 'Viewer',
    );
    const superAdmin = roles.body.data.items.find(
      (r: { name: string }) => r.name === SUPER_ADMIN_ROLE,
    );
    expect(viewerRole).toBeTruthy();
    expect(superAdmin).toBeTruthy();

    const assign = await request(app)
      .put(`/api/users/${adminId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [superAdmin.id, viewerRole.id] });

    expect(assign.status).toBe(200);
    expect(assign.body.data.roles.some((r: { name: string }) => r.name === 'Viewer')).toBe(true);
    expect(assign.body.data.roles.some((r: { name: string }) => r.name === SUPER_ADMIN_ROLE)).toBe(
      true,
    );
  });
});
