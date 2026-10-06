import type { Prisma } from '@prisma/client';

export async function notifyGroup(
  tx: Prisma.TransactionClient,
  groupId: string,
  title: string,
  body: string,
) {
  const members = await tx.groupMember.findMany({
    where: { groupId, user: { status: 'ACTIVE', role: { not: 'PARENT' } } },
    select: { userId: true },
  });
  if (members.length === 0) return;
  await tx.notification.createMany({
    data: members.map((member) => ({
      userId: member.userId,
      type: 'SCHEDULE_CHANGED',
      title,
      body,
    })),
  });
}
