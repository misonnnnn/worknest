import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  createRefreshTokenId,
  hashToken,
  parseDurationToMs,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import { unauthorized, forbidden } from '../../lib/errors';
import { writeAuditLog } from '../../lib/audit';
import { env } from '../../config/env';
import type { AuthUser } from '@worknest/types';

async function loadAuthUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
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

  const permissions = new Set<string>();
  const roles = user.roles.map((ur) => {
    for (const rp of ur.role.permissions) {
      permissions.add(rp.permission.key);
    }
    return { id: ur.role.id, name: ur.role.name };
  });

  return {
    id: user.id,
    email: user.email,
    isActive: user.isActive,
    permissions: Array.from(permissions),
    roles,
    employee: user.employee,
  };
}

async function issueTokens(userId: string, email: string) {
  const jti = createRefreshTokenId();
  const accessToken = signAccessToken({ sub: userId, email });
  const refreshToken = signRefreshToken(userId, jti);
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_EXPIRES_IN));

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

export const authService = {
  async login(
    email: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      throw unauthorized('Invalid email or password');
    }
    if (!user.isActive) {
      throw forbidden('User account is inactive');
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw unauthorized('Invalid email or password');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await issueTokens(user.id, user.email);
    const me = await loadAuthUser(user.id);

    await writeAuditLog({
      userId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { ...tokens, user: me };
  },

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw unauthorized('Invalid or expired refresh token');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw unauthorized('Refresh token is revoked or expired');
    }

    if (stored.tokenHash !== hashToken(refreshToken)) {
      throw unauthorized('Invalid refresh token');
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw unauthorized('User account is inactive or not found');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return issueTokens(user.id, user.email);
  },

  async logout(
    userId: string,
    refreshToken: string | undefined,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        await prisma.refreshToken.updateMany({
          where: { id: payload.jti, userId },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Ignore invalid refresh token on logout
      }
    } else {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await writeAuditLog({
      userId,
      action: 'LOGOUT',
      resource: 'auth',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  },

  async me(userId: string) {
    return loadAuthUser(userId);
  },

  async hashPassword(password: string) {
    return hashPassword(password);
  },
};
