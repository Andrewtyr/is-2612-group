import { z } from 'zod';

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

const inputSchema = z.object({
  group: z.string().min(1),
  dates: z.array(z.iso.date()).min(1).max(31),
  students: z.array(z.object({
    name: z.string().min(1),
    unexcused: z.array(z.number().int().nonnegative().max(16)),
    excused: z.array(z.number().int().nonnegative().max(16)),
  })).min(1).max(100),
});

function normalizedName(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

export function prepareDailyAbsenceImport(input: unknown, members: Member[]) {
  const parsed = inputSchema.parse(input);
  if (new Set(parsed.dates).size !== parsed.dates.length)
    throw new Error('Даты повторяются');
  const membersByName = new Map<string, Member>();
  for (const member of members) {
    const key = normalizedName([member.lastName, member.firstName, member.middleName].filter(Boolean).join(' '));
    if (membersByName.has(key)) throw new Error('В группе есть совпадающие ФИО');
    membersByName.set(key, member);
  }
  const seenStudents = new Set<string>();
  return parsed.students.flatMap((student) => {
    const key = normalizedName(student.name);
    if (seenStudents.has(key)) throw new Error('Студент указан дважды');
    seenStudents.add(key);
    const member = membersByName.get(key);
    if (!member) throw new Error('Студент из ведомости не найден в группе');
    if (student.unexcused.length !== parsed.dates.length ||
        student.excused.length !== parsed.dates.length)
      throw new Error('Количество часов не совпадает с количеством дат');
    return parsed.dates.map((date, index) => {
      const unexcusedHours = student.unexcused[index];
      const excusedHours = student.excused[index];
      if (unexcusedHours % 2 || excusedHours % 2)
        throw new Error('Количество часов должно быть чётным');
      if (unexcusedHours + excusedHours > 16)
        throw new Error('Слишком много пропущенных часов за день');
      return { studentId: member.id, date, unexcusedHours, excusedHours };
    });
  });
}

type ImportRow = ReturnType<typeof prepareDailyAbsenceImport>[number];
type ExistingRow = Omit<ImportRow, 'date'> & { date: Date };

export function selectNewDailyAbsenceRows(incoming: ImportRow[], existing: ExistingRow[]) {
  const oldByKey = new Map(existing.map((row) => [
    `${row.studentId}:${row.date.toISOString().slice(0, 10)}`, row,
  ]));
  return incoming.filter((row) => {
    const old = oldByKey.get(`${row.studentId}:${row.date}`);
    if (!old) return true;
    if (old.unexcusedHours !== row.unexcusedHours || old.excusedHours !== row.excusedHours)
      throw new Error('Существующий дневной итог отличается от импортируемого');
    return false;
  });
}
