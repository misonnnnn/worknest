import { prisma } from './prisma';
import { PERMISSIONS, SUPER_ADMIN_ROLE } from '../config/permissions';

/** Upsert the permission catalog and grant any new keys to Super Admin. */
export async function syncPermissions() {
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

  const role = await prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE } });
  if (!role) return;

  const permissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
}
