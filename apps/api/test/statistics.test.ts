import { describe, expect, it } from 'vitest';
import { attendanceSummary } from '../src/modules/statistics/statistics';

describe('attendanceSummary', () => {
  it('excludes cancelled and unmarked lessons from the denominator', () => {
    expect(
      attendanceSummary([
        { lessonStatus: 'PLANNED', attendanceStatus: 'PRESENT' },
        { lessonStatus: 'PLANNED', attendanceStatus: 'ABSENT' },
        { lessonStatus: 'PLANNED', attendanceStatus: null },
        { lessonStatus: 'CANCELLED', attendanceStatus: 'ABSENT' },
      ]),
    ).toEqual({
      total: 2,
      attended: 1,
      missed: 1,
      late: 0,
      excused: 0,
      percent: 50,
    });
  });
});
