import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { PERMISSIONS } from '../src/config/permissions';
import { ensureProjectCatalog } from '../src/modules/projects/catalog';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('Project management', () => {
  let adminToken = '';
  let reporterToken = '';
  let adminId = '';
  let reporterId = '';

  beforeAll(async () => {
    for (const permission of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      });
    }
    await ensureProjectCatalog(prisma);

    const passwordHash = await hashPassword('TestPass123!');
    const adminEmail = 'pm-admin@worknest.local';
    const reporterEmail = 'pm-reporter@worknest.local';

    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash, isActive: true },
      create: { email: adminEmail, passwordHash, isActive: true },
    });
    adminId = admin.id;

    const reporter = await prisma.user.upsert({
      where: { email: reporterEmail },
      update: { passwordHash, isActive: true },
      create: { email: reporterEmail, passwordHash, isActive: true },
    });
    reporterId = reporter.id;

    const adminRole = await prisma.role.upsert({
      where: { name: 'PM Admin' },
      update: {},
      create: { name: 'PM Admin', description: 'Project management admin' },
    });
    const adminPerms = await prisma.permission.findMany({
      where: {
        key: {
          in: [
            'projects.view',
            'projects.create',
            'projects.update',
            'projects.delete',
            'projects.manage',
            'work-items.create',
            'work-items.update',
            'work-items.assign',
            'work-items.delete',
          ],
        },
      },
    });
    await prisma.rolePermission.createMany({
      data: adminPerms.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });

    const reporterRole = await prisma.role.upsert({
      where: { name: 'Issue Reporter' },
      update: {},
      create: { name: 'Issue Reporter', description: 'Can view projects and report issues' },
    });

    const needed = await prisma.permission.findMany({
      where: { key: { in: ['projects.view', 'work-items.create'] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: reporterRole.id } });
    await prisma.rolePermission.createMany({
      data: needed.map((permission) => ({
        roleId: reporterRole.id,
        permissionId: permission.id,
      })),
    });

    await prisma.userRole.deleteMany({ where: { userId: reporter.id } });
    await prisma.userRole.create({
      data: { userId: reporter.id, roleId: reporterRole.id },
    });

    adminToken = await login(adminEmail, 'TestPass123!');
    reporterToken = await login(reporterEmail, 'TestPass123!');
  });

  it('lets a non-member report a work item on a project', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Website Development',
        key: `WEB${Date.now().toString().slice(-4)}`,
        projectManagerId: adminId,
      });

    expect(created.status).toBe(201);
    expect(created.body.data.createdBy.id).toBe(adminId);
    expect(created.body.data.projectManager.id).toBe(adminId);

    const projectId = created.body.data.id as string;
    const lookups = await request(app)
      .get('/api/projects/lookups')
      .set('Authorization', `Bearer ${reporterToken}`);
    expect(lookups.status).toBe(200);

    const bugType = lookups.body.data.workItemTypes.find((type: { name: string }) => type.name === 'Bug');
    expect(bugType).toBeTruthy();

    const members = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`);
    const reporterIsMember = members.body.data.some(
      (member: { user: { id: string } }) => member.user.id === reporterId,
    );
    expect(reporterIsMember).toBe(false);

    const issue = await request(app)
      .post(`/api/projects/${projectId}/work-items`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        typeId: bugType.id,
        title: 'Homepage banner broken on mobile',
        description: 'Banner disappears on small screens.',
        priority: 'HIGH',
        assigneeId: adminId,
      });

    expect(issue.status).toBe(201);
    expect(issue.body.data.reporter.id).toBe(reporterId);
    expect(issue.body.data.assignee.id).toBe(adminId);
    expect(issue.body.data.type.name).toBe('Bug');
    expect(issue.body.data.key).toMatch(/-1$/);
  });
});
