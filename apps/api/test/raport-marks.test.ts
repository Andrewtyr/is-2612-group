import { describe, expect, it } from 'vitest';
import { buildRaportMarks } from '../src/modules/attendance/raport-marks';

describe('buildRaportMarks', () => {
  it('marks only the chosen missed lessons absent and everyone else present', () => {
    const marks = buildRaportMarks(
      ['math', 'history'],
      ['anna', 'boris'],
      [{ studentId: 'anna', lessonIds: ['math'], status: 'ABSENT' }],
      [],
    );
    expect(marks).toEqual([
      {
        lessonId: 'math',
        studentId: 'anna',
        status: 'ABSENT',
        oldStatus: undefined,
      },
      {
        lessonId: 'math',
        studentId: 'boris',
        status: 'PRESENT',
        oldStatus: undefined,
      },
      {
        lessonId: 'history',
        studentId: 'anna',
        status: 'PRESENT',
        oldStatus: undefined,
      },
      {
        lessonId: 'history',
        studentId: 'boris',
        status: 'PRESENT',
        oldStatus: undefined,
      },
    ]);
  });

  it('preserves unchanged marks and records changes to old marks', () => {
    const marks = buildRaportMarks(
      ['math'],
      ['anna', 'boris'],
      [{ studentId: 'anna', lessonIds: ['math'], status: 'EXCUSED' }],
      [
        { lessonId: 'math', studentId: 'anna', status: 'ABSENT' },
        { lessonId: 'math', studentId: 'boris', status: 'PRESENT' },
      ],
    );
    expect(marks).toEqual([
      {
        lessonId: 'math',
        studentId: 'anna',
        status: 'EXCUSED',
        oldStatus: 'ABSENT',
      },
    ]);
  });
});
