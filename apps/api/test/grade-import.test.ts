import { describe, expect, it } from 'vitest';
import { planGradeImport } from '../src/modules/grades/grade-import';

const date = '2026-09-05';
const base = { studentId: 'student-1', subject: 'БПр.01 Русский язык', date };

describe('grade import without duplicates', () => {
  it('recognizes the same mark imported from a different source column', () => {
    expect(
      planGradeImport(
        [{ ...base, columnIndex: 36, value: '5' }],
        [
          {
            ...base,
            id: 'old',
            date: new Date(`${date}T00:00:00Z`),
            columnIndex: 4,
            value: '5',
          },
        ],
      ),
    ).toEqual([{ type: 'unchanged' }]);
  });

  it('updates changed marks without adding duplicates', () => {
    expect(
      planGradeImport(
        [{ ...base, columnIndex: 30, value: '4' }],
        [{ ...base, id: 'old', columnIndex: 7, value: '3' }],
      ),
    ).toEqual([{ type: 'update', id: 'old', value: '4' }]);
  });

  it('preserves several separate marks on the same date', () => {
    const ops = planGradeImport(
      [
        { ...base, columnIndex: 36, value: 'нб' },
        { ...base, columnIndex: 37, value: '5' },
        { ...base, columnIndex: 38, value: 'нб' },
      ],
      [
        { ...base, id: 'a', columnIndex: 10, value: 'нб' },
        { ...base, id: 'b', columnIndex: 20, value: '4' },
      ],
    );
    expect(ops).toEqual([
      { type: 'unchanged' },
      { type: 'update', id: 'b', value: '5' },
      {
        type: 'insert',
        entry: { ...base, columnIndex: 38, value: 'нб' },
        columnIndex: 21,
        subject: base.subject,
      },
    ]);
  });

  it('treats extra spaces in subject as the same subject', () => {
    expect(
      planGradeImport(
        [
          {
            ...base,
            subject: 'БПр.01  Русский   язык',
            columnIndex: 0,
            value: '5',
          },
        ],
        [{ ...base, id: 'old', columnIndex: 8, value: '5' }],
      ),
    ).toEqual([{ type: 'unchanged' }]);
  });

  it('keeps one subject label even when later dates come from an Excel export', () => {
    const incoming = [
      {
        ...base,
        subject: 'Русский язык',
        date: '2026-10-09',
        columnIndex: 0,
        value: '4',
      },
    ];
    const stored = [{ ...base, id: 'old', columnIndex: 3, value: '5' }];
    expect(planGradeImport(incoming, stored)).toEqual([
      {
        type: 'insert',
        entry: incoming[0],
        columnIndex: 0,
        subject: base.subject,
      },
    ]);
  });

  it('does not delete saved grades omitted from a newer export', () => {
    expect(
      planGradeImport(
        [{ ...base, columnIndex: 99, value: '5' }],
        [
          { ...base, id: 'a', columnIndex: 0, value: '5' },
          { ...base, id: 'b', columnIndex: 1, value: '3' },
        ],
      ),
    ).toEqual([{ type: 'unchanged' }]);
  });
});
