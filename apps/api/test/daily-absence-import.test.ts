import { describe, expect, it } from 'vitest';
import { prepareDailyAbsenceImport, selectNewDailyAbsenceRows } from '../src/modules/attendance/daily-absence-import';

const members = [
  { id: 's1', firstName: 'Анна', lastName: 'Иванова', middleName: 'Игоревна' },
];

describe('paper daily absence import', () => {
  it('matches a known student and keeps explicit zero days without assigning lessons', () => {
    const rows = prepareDailyAbsenceImport({
      group: 'ИС-2612', dates: ['2026-10-12', '2026-10-13'],
      students: [{ name: 'Иванова Анна Игоревна', unexcused: [0, 2], excused: [0, 4] }],
    }, members);
    expect(rows).toEqual([
      { studentId: 's1', date: '2026-10-12', unexcusedHours: 0, excusedHours: 0 },
      { studentId: 's1', date: '2026-10-13', unexcusedHours: 2, excusedHours: 4 },
    ]);
  });

  it('rejects unrecognized names and fractional or odd hours', () => {
    const input = {
      group: 'ИС-2612', dates: ['2026-10-12'],
      students: [{ name: 'Неизвестный студент', unexcused: [2], excused: [0] }],
    };
    expect(() => prepareDailyAbsenceImport(input, members)).toThrow('не найден');
    expect(() => prepareDailyAbsenceImport({
      ...input, students: [{ name: 'Иванова Анна Игоревна', unexcused: [3], excused: [0] }],
    }, members)).toThrow('чётным');
  });

  it('can be rerun without overwriting a different daily total', () => {
    const incoming = [{ studentId: 's1', date: '2026-10-12', unexcusedHours: 0, excusedHours: 6 }];
    expect(selectNewDailyAbsenceRows(incoming, [
      { studentId: 's1', date: new Date('2026-10-12'), unexcusedHours: 0, excusedHours: 6 },
    ])).toEqual([]);
    expect(() => selectNewDailyAbsenceRows(incoming, [
      { studentId: 's1', date: new Date('2026-10-12'), unexcusedHours: 6, excusedHours: 0 },
    ])).toThrow('отличается');
  });
});
