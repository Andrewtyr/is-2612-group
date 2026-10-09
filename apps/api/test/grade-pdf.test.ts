import { describe, expect, it } from 'vitest';
import { extractGradePage } from '../src/modules/grades/grade-pdf';

describe('grade journal PDF', () => {
  it('keeps a student row when PDF text contains extra punctuation', () => {
    const page = extractGradePage(
      [
        {
          str: 'Наименование предмета БПр.03 Иностранный язык',
          x: 119,
          y: 743,
        },
        { str: '14.09', x: 184, y: 690 },
        { str: '1', x: 30, y: 675 },
        { str: 'Беляев Григорий Андреевич.', x: 42, y: 675 },
        { str: '4', x: 178, y: 675 },
        { str: '2', x: 30, y: 664 },
        { str: 'Ворончихин Роман Игоревич', x: 42, y: 664 },
        { str: '5', x: 178, y: 664 },
      ],
      2026,
    );
    expect(page?.rows).toHaveLength(2);
    expect(page?.rows[0].grades[0].value).toBe('4');
    expect(page?.rows[1].grades[0].value).toBe('5');
  });
  it('reads a subject above the table and dates above student grades', () => {
    const page = extractGradePage(
      [
        {
          str: 'Наименование предмета БПр.03 Иностранный язык',
          x: 120,
          y: 750,
        },
        { str: '14.09', x: 210, y: 690 },
        { str: '17.09', x: 230, y: 690 },
        { str: '03.10', x: 250, y: 690 },
        { str: '1', x: 10, y: 650 },
        { str: 'Беляев Григорий Андреевич', x: 30, y: 650 },
        { str: '4', x: 211, y: 650 },
        { str: '5', x: 232, y: 650 },
        { str: 'нб', x: 251, y: 650 },
      ],
      2026,
    );
    expect(page?.subject).toBe('БПр.03 Иностранный язык');
    expect(page?.rows[0].name).toBe('Беляев Григорий Андреевич');
    expect(page?.rows[0].grades).toEqual([
      { date: '2026-09-14', columnIndex: 0, value: '4' },
      { date: '2026-09-17', columnIndex: 1, value: '5' },
      { date: '2026-10-03', columnIndex: 2, value: 'нб' },
    ]);
  });
});
