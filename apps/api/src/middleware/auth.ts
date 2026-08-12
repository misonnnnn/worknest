import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '@worknest/types';
import { verifyAccessToken } from '../lib/jwt';
import { unauthorized, forbidden } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized();
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw unauthorized();
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired access token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    throw unauthorized('User account is inactive or not found');
  }

  const permissionSet = new Set<string>();
  const roles = user.roles.map((ur) => {
    for (const rp of ur.role.permissions) {
      permissionSet.add(rp.permission.key);
    }
    return { id: ur.role.id, name: ur.role.name };
  });

  req.user = {
    id: user.id,
    email: user.email,
    isActive: user.isActive,
    permissions: Array.from(permissionSet),
    roles,
    employee: user.employee,
  };

  next();
});

export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    const hasAll = required.every((permission) => req.user!.permissions.includes(permission));
    if (!hasAll) {
      return next(forbidden(`Missing required permission: ${required.join(', ')}`));
    }

    return next();
  };
}

export function requireSelfEmployeeOrPermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    const employeeId = req.params.id;
    const isOwnEmployee = Boolean(employeeId && req.user.employee?.id === employeeId);
    if (isOwnEmployee || req.user.permissions.includes(permission)) {
      return next();
    }

    return next(forbidden('You can only update your own employee photo'));
  };
}

export function requireAnyPermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    const hasAny = required.some((permission) => req.user!.permissions.includes(permission));
    if (!hasAny) {
      return next(forbidden(`Missing required permission: one of ${required.join(', ')}`));
    }

    return next();
  };
}
