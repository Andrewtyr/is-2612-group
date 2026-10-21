import * as XLSX from '@e965/xlsx';
import type { ParsedGradePage } from './grade-pdf';

const MONTHS: [RegExp, number][] = [
  [/январ/u, 1],
  [/феврал/u, 2],
  [/март/u, 3],
  [/апрел/u, 4],
  [/ма[йя]/u, 5],
  [/июн/u, 6],
  [/июл/u, 7],
  [/август/u, 8],
  [/сентябр/u, 9],
  [/октябр/u, 10],
  [/ноябр/u, 11],
  [/декабр/u, 12],
];
const SLOTS_PER_DAY = 6;

type Cell = string | number | boolean | null | undefined;
type Matrix = Cell[][];
type Grade = ParsedGradePage['rows'][number]['grades'][number];

function asText(value: Cell): string {
  return value == null
    ? ''
    : String(value)
        .replace(/\u00a0/gu, ' ')
        .trim();
}

function monthInTitle(value: string): number | null {
  const title = value.toLocaleLowerCase('ru-RU');
  if (!/табель\s+успеваемости/u.test(title)) return null;
  return MONTHS.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}

function isoDate(year: number, month: number, day: number) {
  const text = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== text
  ) {
    throw new Error(`Неверная дата в заголовке Excel: ${text}`);
  }
  return text;
}

function dayColumns(header: Cell[], initialMonth: number, schoolYear: number) {
  const result: { sourceCol: number; date: string }[] = [];
  let monthOffset = 0;
  let previous = 0;
  for (let c = 3; c < header.length; c++) {
    const text = asText(header[c]);
    if (!/^\d{1,2}$/.test(text)) continue;
    const day = Number(text);
    if (day < 1 || day > 31) continue;
    if (day <= previous) monthOffset++;
    const absoluteMonth = initialMonth + monthOffset;
    const month = ((absoluteMonth - 1) % 12) + 1;
    const initialYear = schoolYear + (initialMonth < 8 ? 1 : 0);
    const year = initialYear + Math.floor((absoluteMonth - 1) / 12);
    result.push({ sourceCol: c, date: isoDate(year, month, day) });
    previous = day;
  }
  if (!result.length || result.length > 366) {
    throw new Error('Не найдены даты в заголовке Excel');
  }
  return result;
}

function parseMarks(raw: string) {
  const marks = raw.split(/[\s,;]+/u).filter(Boolean);
  if (marks.length > SLOTS_PER_DAY) {
    throw new Error(
      'Слишком много оценок в одной ячейке Excel — проверьте файл',
    );
  }
  return marks.map((mark) => {
    const token = mark.toLocaleLowerCase('ru-RU');
    if (/^[2-5]$/.test(token)) return { value: token, needsReview: false };
    if (token === 'н' || token === 'нб')
      return { value: 'нб', needsReview: false };
    return { value: mark, needsReview: true };
  });
}

/** Parser for the academy's student-by-student "Табель успеваемости".
 * No student data is written to disk. Unknown cells are flagged for manual review.
 */
export function parseGradeExcel(
  buffer: Uint8Array,
  academicYearStart: number,
): ParsedGradePage[] {
  const book = XLSX.read(buffer, {
    type: 'buffer',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });
  if (!book.SheetNames.length) throw new Error('В Excel нет листов');
  const sheet = book.Sheets[book.SheetNames[0]];
  const bounds = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  if (bounds.e.r > 9999 || bounds.e.c > 127) {
    throw new Error('В Excel слишком много строк или колонок');
  }
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  }) as Matrix;
  if (rows.length > 10000) throw new Error('В Excel слишком много строк');

  let month: number | null = null;
  const bySubject = new Map<
    string,
    {
      name: string;
      rows: Map<string, { name: string; grades: Grade[] }>;
      dates: Map<number, string>;
    }
  >();
  let matchedStudents = 0;
  for (let i = 0; i < rows.length; i++) {
    const text = asText(rows[i]?.[1]);
    const titleMonth = monthInTitle(text);
    if (titleMonth !== null) month = titleMonth;
    if (!/^студент\s*:/iu.test(text)) continue;
    matchedStudents++;
    const student = asText(rows[i]?.[2]);
    if (student.length < 5 || !month) {
      throw new Error('Не удалось определить ФИО студента или месяц табеля');
    }
    const headerIndex =
      i +
      1 +
      rows
        .slice(i + 1, i + 5)
        .findIndex(
          (row) => asText(row[1]).toLocaleLowerCase('ru-RU') === 'дисциплина',
        );
    if (headerIndex <= i || headerIndex >= rows.length) {
      throw new Error(`Не найдена строка дат для студента ${student}`);
    }
    const dates = dayColumns(rows[headerIndex], month, academicYearStart);
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const name = asText(rows[r]?.[1]);
      if (
        !name ||
        /^(?:куратор|дата формирования|студент\s*:|табель\s+успеваемости)/iu.test(
          name,
        )
      )
        break;
      const key = name
        .normalize('NFC')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase('ru-RU');
      let subject = bySubject.get(key);
      if (!subject) {
        subject = { name, rows: new Map(), dates: new Map() };
        bySubject.set(key, subject);
      }
      let studentRow = subject.rows.get(student);
      if (!studentRow) {
        studentRow = { name: student, grades: [] };
        subject.rows.set(student, studentRow);
      }
      for (const { sourceCol, date } of dates) {
        const cell = asText(rows[r]?.[sourceCol]);
        if (!cell) continue;
        const marks = parseMarks(cell);
        const dayIndex = sourceCol - dates[0].sourceCol;
        for (let slot = 0; slot < marks.length; slot++) {
          const columnIndex = dayIndex * SLOTS_PER_DAY + slot;
          if (columnIndex > 500) {
            throw new Error('Слишком много колонок оценок в табеле');
          }
          const mark = marks[slot];
          studentRow.grades.push({
            date,
            columnIndex,
            value: mark.value,
            ...(mark.needsReview ? { needsReview: true, raw: mark.value } : {}),
          });
          subject.dates.set(columnIndex, date);
        }
      }
    }
    i = Math.max(i, headerIndex);
  }
  if (!matchedStudents || !bySubject.size) {
    throw new Error('Формат Excel не похож на табель успеваемости академии');
  }
  const pages: ParsedGradePage[] = [];
  for (const subject of bySubject.values()) {
    const populated = [...subject.rows.values()].filter(
      (row) => row.grades.length,
    );
    if (!populated.length) continue;
    const dates = [...subject.dates.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([columnIndex, date]) => ({ date, columnIndex }));
    pages.push({ subject: subject.name, dates, rows: populated });
  }
  if (!pages.length) throw new Error('В Excel не найдено оценок');
  return pages;
}
