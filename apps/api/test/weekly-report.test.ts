import { describe, expect, it } from 'vitest';
import {
  buildWeeklyReport,
  weekMonday,
} from '../src/modules/attendance/weekly-report';

describe('weekly absence report', () => {
  it('starts the selected week on Monday', () => {
    expect(weekMonday('2026-10-09')).toBe('2026-10-05');
  });

  it('counts two hours per absent lesson and separates excused hours', () => {
    const report = buildWeeklyReport(
      '2026-10-05',
      [{ id: 'student-1', firstName: 'Иван', lastName: 'Петров' }],
      [
        { id: 'lesson-1', date: new Date('2026-10-05'), status: 'PLANNED' },
        { id: 'lesson-2', date: new Date('2026-10-05'), status: 'PLANNED' },
        { id: 'lesson-3', date: new Date('2026-10-06'), status: 'PLANNED' },
        { id: 'lesson-4', date: new Date('2026-10-06'), status: 'CANCELLED' },
      ],
      [
        { lessonId: 'lesson-1', studentId: 'student-1', status: 'ABSENT' },
        { lessonId: 'lesson-2', studentId: 'student-1', status: 'EXCUSED' },
      ],
    );
    expect(report.students[0].days[0]).toEqual({
      date: '2026-10-05',
      unexcusedHours: 2,
      excusedHours: 2,
      unmarkedLessons: 0,
    });
    expect(report.students[0].days[1].unmarkedLessons).toBe(1);
    expect(report.students[0].totalUnexcusedHours).toBe(2);
    expect(report.students[0].totalExcusedHours).toBe(2);
  });
});
