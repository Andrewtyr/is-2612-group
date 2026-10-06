import { describe, expect, it } from 'vitest';
import { applyOfficialChange } from '../src/modules/schedule/schedule-merge';

describe('applyOfficialChange', () => {
  const base = {
    lessonNumber: 3,
    subject: 'Математика',
    room: '205',
    teacher: 'Иванова',
    status: 'PLANNED' as const,
  };

  it('applies a dated room change without dropping the original subject', () => {
    expect(applyOfficialChange(base, { room: '301' })).toEqual({
      ...base,
      room: '301',
      status: 'CHANGED',
    });
  });

  it('preserves a cancellation as a visible lesson', () => {
    expect(applyOfficialChange(base, { status: 'CANCELLED' })).toEqual({
      ...base,
      status: 'CANCELLED',
    });
  });
});
