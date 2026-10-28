import { describe, expect, it, vi } from 'vitest';
import { compare } from 'bcryptjs';
import { UsersController } from '../src/modules/users/users.controller';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuthRequest } from '../src/common/auth.guard';

describe('administrator password reset', () => {
  it('sets a temporary hashed password and audits the action without storing the plaintext', async () => {
    const update = vi.fn(async (args: { data: { passwordHash: string; mustChangePass: boolean } }) => {
      void args;
      return {};
    });
    const audit = vi.fn(async () => ({}));
    const tx = { user: { update }, auditLog: { create: audit } };
    const prisma = {
      group: { findUnique: async () => ({ id: 'group' }) },
      groupMember: { findUnique: async () => ({ user: { role: 'STUDENT' } }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService;
    const controller = new UsersController(prisma);
    const request = { user: { id: 'admin', role: 'ADMIN' } } as AuthRequest;
    const password = 'Temporary-2026';

    await expect(controller.resetPassword(request, 'student', { password })).resolves.toEqual({ ok: true });
    const data = update.mock.calls[0][0].data;
    expect(data.mustChangePass).toBe(true);
    expect(await compare(password, data.passwordHash)).toBe(true);
    expect(JSON.stringify(audit.mock.calls)).not.toContain(password);
  });
});
