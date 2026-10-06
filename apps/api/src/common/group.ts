import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export async function primaryGroup(prisma: PrismaService) {
  const group = await prisma.group.findUnique({
    where: { name: process.env.GROUP_NAME ?? 'ИС-2612' },
  });
  if (!group) throw new NotFoundException('Группа ещё не создана');
  return group;
}

export function isoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new NotFoundException('Неверная дата');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new NotFoundException('Неверная дата');
  }
  return date;
}

export function todayInNovosibirsk(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
}
