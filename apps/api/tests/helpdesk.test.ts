import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { PERMISSIONS } from '../src/config/permissions';
import { ensureDefaultCategories } from '../src/modules/helpdesk/helpers';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

async function grantRole(userId: string, roleName: string, keys: string[]) {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName, description: roleName },
  });
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

describe('Helpdesk', () => {
  let employeeToken = '';
  let otherEmployeeToken = '';
  let managerToken = '';
  let technicianToken = '';
  let categoryId = '';
  let employeeTicketId = '';

  beforeAll(async () => {
    for (const permission of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      });
    }
    await ensureDefaultCategories(prisma);

    const passwordHash = await hashPassword('TestPass123!');
    const employee = await prisma.user.upsert({
      where: { email: 'hd-employee@worknest.local' },
      update: { passwordHash, isActive: true },
      create: { email: 'hd-employee@worknest.local', passwordHash, isActive: true },
    });
    const other = await prisma.user.upsert({
      where: { email: 'hd-other@worknest.local' },
      update: { passwordHash, isActive: true },
      create: { email: 'hd-other@worknest.local', passwordHash, isActive: true },
    });
    const manager = await prisma.user.upsert({
      where: { email: 'hd-manager@worknest.local' },
      update: { passwordHash, isActive: true },
      create: { email: 'hd-manager@worknest.local', passwordHash, isActive: true },
    });
    const tech = await prisma.user.upsert({
      where: { email: 'hd-tech@worknest.local' },
      update: { passwordHash, isActive: true },
      create: { email: 'hd-tech@worknest.local', passwordHash, isActive: true },
    });

    await grantRole(employee.id, 'HD Employee Test', [
      'helpdesk.view',
      'helpdesk.create',
      'helpdesk.comment',
      'helpdesk.reopen',
    ]);
    await grantRole(other.id, 'HD Other Employee Test', [
      'helpdesk.view',
      'helpdesk.create',
      'helpdesk.comment',
    ]);
    await grantRole(manager.id, 'HD Manager Test', [
      'helpdesk.view',
      'helpdesk.view_all',
      'helpdesk.create',
      'helpdesk.update',
      'helpdesk.assign',
      'helpdesk.resolve',
      'helpdesk.close',
      'helpdesk.reopen',
      'helpdesk.comment',
      'helpdesk.manage_categories',
    ]);
    await grantRole(tech.id, 'HD Tech Test', [
      'helpdesk.view',
      'helpdesk.create',
      'helpdesk.update',
      'helpdesk.assign',
      'helpdesk.resolve',
      'helpdesk.close',
      'helpdesk.reopen',
      'helpdesk.comment',
    ]);

    const category = await prisma.iTTicketCategory.findFirst({ where: { isActive: true } });
    expect(category).toBeTruthy();
    categoryId = category!.id;

    employeeToken = await login('hd-employee@worknest.local', 'TestPass123!');
    otherEmployeeToken = await login('hd-other@worknest.local', 'TestPass123!');
    managerToken = await login('hd-manager@worknest.local', 'TestPass123!');
    technicianToken = await login('hd-tech@worknest.local', 'TestPass123!');
  });

  it('lets employees create and view own tickets, but not others', async () => {
    const created = await request(app)
      .post('/api/helpdesk/tickets')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        title: 'Laptop will not boot',
        description: 'Black screen on startup',
        categoryId,
        priority: 'HIGH',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.ticketNumber).toMatch(/^IT-\d{4}-\d{5}$/);
    employeeTicketId = created.body.data.id;

    const own = await request(app)
      .get(`/api/helpdesk/tickets/${employeeTicketId}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(own.status).toBe(200);

    const forbidden = await request(app)
      .get(`/api/helpdesk/tickets/${employeeTicketId}`)
      .set('Authorization', `Bearer ${otherEmployeeToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('allows only the requester or IT staff to post comments', async () => {
    await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/comments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ message: 'Any update on this?' })
      .expect(201);

    // Other employee cannot access (or comment on) someone else's ticket.
    const otherComment = await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/comments`)
      .set('Authorization', `Bearer ${otherEmployeeToken}`)
      .send({ message: 'I should not be able to post this' });
    expect([403, 404]).toContain(otherComment.status);
  });

  it('hides internal notes from employees and records history on resolve', async () => {
    const techUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'hd-tech@worknest.local' },
    });

    await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/assign`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ assigneeId: techUser.id })
      .expect(200);

    await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/comments`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ message: 'Checking hardware', isInternal: true })
      .expect(201);

    await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/comments`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ message: 'We are investigating', isInternal: false })
      .expect(201);

    const employeeView = await request(app)
      .get(`/api/helpdesk/tickets/${employeeTicketId}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(employeeView.status).toBe(200);
    expect(employeeView.body.data.comments.every((c: { isInternal: boolean }) => !c.isInternal)).toBe(
      true,
    );

    const techView = await request(app)
      .get(`/api/helpdesk/tickets/${employeeTicketId}`)
      .set('Authorization', `Bearer ${technicianToken}`);
    expect(techView.body.data.comments.some((c: { isInternal: boolean }) => c.isInternal)).toBe(true);

    const badTransition = await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'CLOSED' });
    // ASSIGNED → CLOSED is not allowed by the workflow.
    expect([400, 403]).toContain(badTransition.status);

    const resolved = await request(app)
      .post(`/api/helpdesk/tickets/${employeeTicketId}/resolve`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ resolutionSummary: 'Replaced power adapter' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('RESOLVED');

    const history = techView.body.data.history ?? [];
    const after = await request(app)
      .get(`/api/helpdesk/tickets/${employeeTicketId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(after.body.data.history.some((h: { action: string }) => h.action === 'ticket.resolved')).toBe(
      true,
    );
    expect(history).toBeDefined();
  });

  it('generates unique ticket numbers under concurrent creates', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/helpdesk/tickets')
          .set('Authorization', `Bearer ${employeeToken}`)
          .send({
            title: `Concurrent ticket ${i}`,
            description: 'Load test',
            categoryId,
            priority: 'LOW',
          }),
      ),
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.data.ticketNumber as string);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
