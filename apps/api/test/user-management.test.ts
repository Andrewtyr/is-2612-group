import { describe, expect, it } from 'vitest';
import { canManageUser } from '../src/modules/users/user-policy';

describe('user management policy', () => {
  it('lets an administrator appoint a curator', () => {
    expect(canManageUser('ADMIN', 'STUDENT', 'CURATOR', false)).toBe(true);
  });

  it('does not let a curator appoint another curator', () => {
    expect(canManageUser('CURATOR', 'STUDENT', 'CURATOR', false)).toBe(false);
  });

  it('prevents changing an administrator or oneself', () => {
    expect(canManageUser('ADMIN', 'ADMIN', 'STUDENT', false)).toBe(false);
    expect(canManageUser('ADMIN', 'STUDENT', 'HEAD', true)).toBe(false);
  });

  it('lets a curator appoint the head or block a student', () => {
    expect(canManageUser('CURATOR', 'STUDENT', 'HEAD', false)).toBe(true);
    expect(canManageUser('CURATOR', 'STUDENT', 'STUDENT', false)).toBe(true);
  });
});
