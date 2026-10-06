import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const login = process.env.ADMIN_LOGIN;
  const password = process.env.ADMIN_PASSWORD;
  if (!login || !password || password.length < 12) {
    throw new Error(
      'Set ADMIN_LOGIN and ADMIN_PASSWORD (at least 12 characters) before seeding',
    );
  }
  const group = await prisma.group.upsert({
    where: { name: process.env.GROUP_NAME ?? 'ИС-2612' },
    update: {},
    create: {
      name: process.env.GROUP_NAME ?? 'ИС-2612',
      building: '3',
      scheduleSource: process.env.ACADEMY_SCHEDULE_URL,
    },
  });
  const user = await prisma.user.upsert({
    where: { login },
    update: {},
    create: {
      login,
      firstName: 'Администратор',
      lastName: 'Системы',
      passwordHash: await hash(password, 12),
      role: 'ADMIN',
    },
  });
  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    update: {},
    create: { groupId: group.id, userId: user.id },
  });
  console.log('Created group and administrator:', group.name, login);
}

main().finally(() => prisma.$disconnect());
