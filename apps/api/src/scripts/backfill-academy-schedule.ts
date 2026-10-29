import { PrismaClient } from '@prisma/client';
import { isoDate, todayInNovosibirsk } from '../common/group';
import {
  normalizeMondayLessons,
  parseBellSchedule,
  parseGroupId,
  parseGroupLessons,
  selectLessonBell,
} from '../integrations/academy/academy-parser';

const prisma = new PrismaClient();

async function getText(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
  return response.text();
}

function post(path: string, values: Record<string, string>) {
  return getText(`https://schedule.altag.ru/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
}

async function main() {
  const [mode, fromText, toText] = process.argv.slice(2);
  if ((mode !== '--check' && mode !== '--apply') || !fromText || !toText)
    throw new Error('Использование: backfill-academy-schedule --check|--apply ГГГГ-ММ-ДД ГГГГ-ММ-ДД');
  const from = isoDate(fromText);
  const to = isoDate(toText);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 62 || toText >= todayInNovosibirsk())
    throw new Error('Укажите от 1 до 62 прошедших дней');

  const groupName = process.env.GROUP_NAME ?? 'ИС-2612';
  const group = await prisma.group.findUnique({ where: { name: groupName } });
  if (!group) throw new Error('Группа не найдена в базе');
  const [groupsHtml, bellsHtml] = await Promise.all([
    post('filter_grup.php', { dostup: 'true' }),
    getText('https://altag.ru/student/schedule/call_schedule'),
  ]);
  const academyGroupId = parseGroupId(groupsHtml, groupName);
  const bells = parseBellSchedule(bellsHtml);
  const candidates: {
    date: Date;
    lessonNumber: number;
    subgroup: string;
    subject: string;
    teacher: string;
    room: string;
    building: string;
    startTime: string;
    endTime: string;
  }[] = [];
  const dailyCounts: string[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(from);
    date.setUTCDate(from.getUTCDate() + offset);
    if (date.getUTCDay() === 0) continue;
    const dateText = date.toISOString().slice(0, 10);
    const html = await post('ras.php', {
      dostup: 'true', gruppa: academyGroupId, calendar: dateText, ras: 'GRUP',
    });
    if (!html.includes('table-body'))
      throw new Error(`${dateText}: источник не вернул таблицу; запись остановлена`);
    const parsed = parseGroupLessons(html, groupName);
    const lessons = date.getUTCDay() === 1 ? normalizeMondayLessons(parsed) : parsed;
    for (const lesson of lessons) {
      const scheme = date.getUTCDay() === 1 ? 'MON' : date.getUTCDay() === 6 ? 'SAT' : 'TUE_FRI';
      const bell = selectLessonBell(bells, scheme, lesson.lessonNumber, lesson.subject);
      if (!bell)
        throw new Error(`${dateText}, ${lesson.lessonNumber} пара: нет времени звонка; запись остановлена`);
      candidates.push({ date, ...lesson, startTime: bell.startTime, endTime: bell.endTime });
    }
    dailyCounts.push(`${dateText}: ${lessons.length}`);
  }

  const existing = await prisma.lesson.findMany({
    where: { groupId: group.id, date: { gte: from, lte: to } },
    select: { date: true, lessonNumber: true, subgroup: true },
  });
  const key = (date: Date, number: number, subgroup: string) =>
    `${date.toISOString().slice(0, 10)}:${number}:${subgroup}`;
  const existingKeys = new Set(existing.map((lesson) => key(lesson.date, lesson.lessonNumber, lesson.subgroup)));
  const missing = candidates.filter((lesson) => !existingKeys.has(key(lesson.date, lesson.lessonNumber, lesson.subgroup)));
  console.log(`Дней: ${dailyCounts.length}; занятий в источнике: ${candidates.length}; уже в базе: ${candidates.length - missing.length}; новых: ${missing.length}.`);
  console.log(dailyCounts.join('\n'));
  if (mode === '--check') {
    console.log('Проверка без изменения базы.');
    return;
  }
  let added = 0;
  for (const lesson of missing) {
    await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.upsert({
        where: { name: lesson.subject }, create: { name: lesson.subject }, update: {},
      });
      const teacher = lesson.teacher ? await tx.teacher.upsert({
        where: { name: lesson.teacher }, create: { name: lesson.teacher }, update: {},
      }) : null;
      const result = await tx.lesson.createMany({
        data: [{
          groupId: group.id, date: lesson.date, lessonNumber: lesson.lessonNumber,
          subgroup: lesson.subgroup, subjectId: subject.id, teacherId: teacher?.id,
          room: lesson.room, building: lesson.building,
          startTime: lesson.startTime, endTime: lesson.endTime,
          status: 'PLANNED', source: 'academy',
        }],
        skipDuplicates: true,
      });
      added += result.count;
    });
  }
  console.log(`Сохранено новых занятий: ${added}. Существующие занятия и отметки не менялись.`);
}

main()
  .catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
