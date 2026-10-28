import { describe, expect, it } from 'vitest';
import { buildMonthlyReport } from '../src/modules/attendance/monthly-report';

describe('monthly absence report', () => {
  it('shows every October date and keeps excused and unexcused hours separate', () => {
    const report = buildMonthlyReport(
      '2026-10',
      [{ id: 's1', firstName: 'Иван', lastName: 'Петров' }],
      [
        { id: 'l1', date: new Date('2026-10-12'), status: 'PLANNED' },
        { id: 'l2', date: new Date('2026-10-12'), status: 'PLANNED' },
        { id: 'l3', date: new Date('2026-10-13'), status: 'CANCELLED' },
      ],
      [{ lessonId: 'l1', studentId: 's1', status: 'ABSENT' }],
      [{ studentId: 's1', date: new Date('2026-10-12'), unexcusedHours: 0, excusedHours: 4 }],
    );
    expect(report.days).toHaveLength(31);
    expect(report.students[0].days[11]).toEqual({
      date: '2026-10-12', unexcusedHours: 0, excusedHours: 4, unmarkedLessons: 0,
    });
    expect(report.students[0].totalExcusedHours).toBe(4);
    expect(report.students[0].totalUnexcusedHours).toBe(0);
    expect(report.students[0].days[12].unmarkedLessons).toBe(0);
  });
});
