import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { sanitizeForAudit } from '../src/lib/audit';

describe('password hashing', () => {
  it('hashes and verifies passwords with argon2', async () => {
    const hash = await hashPassword('SecurePass123!');
    expect(hash).not.toContain('SecurePass123!');
    expect(await verifyPassword(hash, 'SecurePass123!')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPassword')).toBe(false);
  });
});

describe('audit sanitization', () => {
  it('redacts sensitive fields', () => {
    const sanitized = sanitizeForAudit({
      email: 'a@b.com',
      password: 'secret',
      passwordHash: 'hash',
      nested: { refreshToken: 'tok', name: 'ok' },
    }) as Record<string, unknown>;

    expect(sanitized.email).toBe('a@b.com');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.passwordHash).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).refreshToken).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).name).toBe('ok');
  });
});
