import type { Role } from '@prisma/client';

export function canManageUser(
  actorRole: Role,
  targetRole: Role,
  nextRole: Role,
  self: boolean,
): boolean {
  if (self || targetRole === 'ADMIN' || nextRole === 'ADMIN') return false;
  if (actorRole !== 'ADMIN' && actorRole !== 'CURATOR') return false;
  if (
    actorRole === 'CURATOR' &&
    (targetRole === 'CURATOR' || nextRole === 'CURATOR')
  )
    return false;
  return ['STUDENT', 'HEAD', 'DEPUTY', 'CURATOR'].includes(nextRole);
}
