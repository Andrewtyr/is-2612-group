import { describe, expect, it } from 'vitest';
import { missingOfficialLessons } from '../src/integrations/academy/academy-reconcile';

const lesson = (
  id: string,
  lessonNumber: number,
  subgroup = '',
  source = 'academy',
  status = 'PLANNED',
) => ({ id, lessonNumber, subgroup, source, status });

describe('reconciliation with academy schedule', () => {
  it('cancels only an automatic lesson removed from the next snapshot', () => {
    const saved = [
      lesson('still', 1),
      lesson('removed', 2),
      lesson('manual', 3, '', 'manual'),
    ];
    const current = [{ lessonNumber: 1, subgroup: '' }];
    expect(missingOfficialLessons(saved, current, [])).toEqual([saved[1]]);
  });

  it('preserves lessons controlled by official PDF changes', () => {
    const saved = [
      lesson('pdf', 4, '', 'official-pdf'),
      lesson('class', 4, '__CLASS_HOUR__'),
    ];
    expect(
      missingOfficialLessons(
        saved,
        [],
        [
          { lessonNumber: 4, classHour: undefined },
          { lessonNumber: 4, classHour: true },
        ],
      ),
    ).toEqual([]);
  });

  it('distinguishes different subgroups and ignores already cancelled lessons', () => {
    const saved = [
      lesson('a', 4, '1'),
      lesson('b', 4, '2'),
      lesson('cancelled', 5, '', 'academy', 'CANCELLED'),
    ];
    expect(
      missingOfficialLessons(saved, [{ lessonNumber: 4, subgroup: '1' }], []),
    ).toEqual([saved[1]]);
  });
});
