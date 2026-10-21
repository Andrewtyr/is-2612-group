import { describe, expect, it } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { parseGradeExcel } from '../src/modules/grades/grade-excel';

function workbook(data: string[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Лист_1');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

describe('academy Excel report', () => {
  it('reads per-student subject rows, two months, absent marks and multiple values in one day', () => {
    const data = [
      ['', 'Табель успеваемости за Сентябрь месяц'],
      ['', 'Студент:', 'Тестов Иван Иванович'],
      [],
      ['', 'Дисциплина', '', '29', '30', '1', '2'],
      ['', 'БПр.01 Русский язык', '', 'Н 5 Н', '4', '3', ''],
      ['', 'ППр.01 Математика', '', '', '', '5', ''],
      ['', 'Куратор'],
      ['', 'Табель успеваемости за Сентябрь месяц'],
      ['', 'Студент:', 'Примерова Анна Сергеевна'],
      [],
      ['', 'Дисциплина', '', '29', '30', '1', '2'],
      ['', 'БПр.01 Русский язык', '', '5', '', '4', ''],
    ];
    const pages = parseGradeExcel(workbook(data), 2026);
    expect(pages).toHaveLength(2);
    const russian = pages.find((page) => page.subject.includes('Русский'))!;
    expect(russian.rows).toHaveLength(2);
    expect(russian.rows[0].grades.map((g) => [g.date, g.value])).toEqual([
      ['2026-09-29', 'нб'],
      ['2026-09-29', '5'],
      ['2026-09-29', 'нб'],
      ['2026-09-30', '4'],
      ['2026-10-01', '3'],
    ]);
    expect(russian.dates.filter((d) => d.date === '2026-09-29')).toHaveLength(
      3,
    );
  });

  it('flags unknown grades instead of silently dropping them', () => {
    const data = [
      ['', 'Табель успеваемости за Октябрь месяц'],
      ['', 'Студент:', 'Иванов Иван'],
      [],
      ['', 'Дисциплина', '', '1'],
      ['', 'Русский язык', '', 'зач'],
    ];
    const pages = parseGradeExcel(workbook(data), 2026);
    expect(pages[0].rows[0].grades[0]).toMatchObject({
      value: 'зач',
      needsReview: true,
    });
  });
});
