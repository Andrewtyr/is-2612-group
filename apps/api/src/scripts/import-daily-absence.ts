import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  prepareDailyAbsenceImport,
  selectNewDailyAbsenceRows,
} from '../modules/attendance/daily-absence-import';

const prisma = new PrismaClient();

async function main() {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--apply')
    throw new Error('Использование: import-daily-absence --check|--apply < файл.json');
  const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
  const groupName = z.object({ group: z.string().min(1) }).parse(raw).group;
  const group = await prisma.group.findUnique({ where: { name: groupName } });
  if (!group) throw new Error('Группа из файла не найдена');
  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id },
    select: { user: { select: {
      id: true, firstName: true, lastName: true, middleName: true,
    } } },
  });
  const incoming = prepareDailyAbsenceImport(raw, members.map((member) => member.user));
  const dates = incoming.map((row) => new Date(`${row.date}T00:00:00.000Z`));
  const existing = await prisma.dailyAbsenceSummary.findMany({
    where: { groupId: group.id, date: { gte: new Date(Math.min(...dates.map(Number))), lte: new Date(Math.max(...dates.map(Number))) } },
    select: { studentId: true, date: true, unexcusedHours: true, excusedHours: true },
  });
  const fresh = selectNewDailyAbsenceRows(incoming, existing);
  const students = new Set(incoming.map((row) => row.studentId)).size;
  const totalUnexcused = incoming.reduce((sum, row) => sum + row.unexcusedHours, 0);
  const totalExcused = incoming.reduce((sum, row) => sum + row.excusedHours, 0);
  console.log(`Проверено: ${students} студентов, ${incoming.length} дневных строк, неув. ${totalUnexcused} ч, ув. ${totalExcused} ч.`);
  console.log(`Новых строк: ${fresh.length}; уже совпадают: ${incoming.length - fresh.length}.`);
  if (mode === '--apply' && fresh.length) {
    await prisma.dailyAbsenceSummary.createMany({
      data: fresh.map((row) => ({
        groupId: group.id,
        studentId: row.studentId,
        date: new Date(`${row.date}T00:00:00.000Z`),
        unexcusedHours: row.unexcusedHours,
        excusedHours: row.excusedHours,
        source: 'paper-photo',
      })),
    });
    console.log(`Сохранено: ${fresh.length}.`);
  } else if (mode === '--check') console.log('Проверка без изменения базы.');
}

main()
  .catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
