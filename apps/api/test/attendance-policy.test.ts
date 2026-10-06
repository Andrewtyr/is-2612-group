import { describe, expect, it } from 'vitest';
import { canEditAttendance } from '../src/modules/attendance/attendance-policy';

describe('canEditAttendance', () => {
  it('lets a curator correct an older lesson', () => {
    expect(
      canEditAttendance(
        'CURATOR',
        '2026-09-30',
        new Date('2026-10-02T10:00:00+07:00'),
      ),
    ).toBe(true);
  });

  it('lets a head mark the group on the lesson day', () => {
    expect(
      canEditAttendance(
        'HEAD',
        '2026-10-02',
        new Date('2026-10-02T17:00:00+07:00'),
      ),
    ).toBe(true);
  });

  it('closes an older lesson to the head', () => {
    expect(
      canEditAttendance(
        'HEAD',
        '2026-10-01',
        new Date('2026-10-02T00:01:00+07:00'),
      ),
    ).toBe(false);
  });

  it('never lets a student set an official attendance status', () => {
    expect(
      canEditAttendance(
        'STUDENT',
        '2026-10-02',
        new Date('2026-10-02T10:00:00+07:00'),
      ),
    ).toBe(false);
  });
});
