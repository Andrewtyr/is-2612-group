import * as XLSX from '@e965/xlsx';
import type { buildMonthlyReport } from './monthly-report';

type MonthlyReport = ReturnType<typeof buildMonthlyReport>;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function renderMonthlyReportXlsx(report: MonthlyReport, groupName: string): Buffer {
  const [year, month] = report.month.split('-').map(Number);
  const title = `${monthNames[month - 1]} ${year}`;
  const rows: (string | number)[][] = [
    [`Ведомость учёта пропущенных часов — ${title}`],
    [`Группа ${groupName}`],
    ['№', 'ФИО', ...report.days.flatMap((day) => [Number(day.slice(-2)), '']), 'ИТОГО', 'Из них', '', 'Примечание'],
    ['', '', ...report.days.flatMap(() => ['неув', 'ув']), 'всего', 'ув', 'неув', ''],
  ];
  report.students.forEach((student, index) => {
    rows.push([
      index + 1,
      student.name,
      ...student.days.flatMap((day) => [day.unexcusedHours || '', day.excusedHours || '']),
      student.totalUnexcusedHours + student.totalExcusedHours,
      student.totalExcusedHours,
      student.totalUnexcusedHours,
      '',
    ]);
  });
  rows.push([
    '', 'Итого часов',
    ...report.days.flatMap((_, dayIndex) => [
      report.students.reduce((sum, student) => sum + student.days[dayIndex].unexcusedHours, 0),
      report.students.reduce((sum, student) => sum + student.days[dayIndex].excusedHours, 0),
    ]),
    report.students.reduce((sum, student) => sum + student.totalUnexcusedHours + student.totalExcusedHours, 0),
    report.students.reduce((sum, student) => sum + student.totalExcusedHours, 0),
    report.students.reduce((sum, student) => sum + student.totalUnexcusedHours, 0),
    '',
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 5 }, { wch: 38 },
    ...report.days.flatMap(() => [{ wch: 6 }, { wch: 6 }]),
    { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 22 },
  ];
  worksheet['!merges'] = report.days.map((_, index) => ({
    s: { r: 2, c: 2 + index * 2 },
    e: { r: 2, c: 3 + index * 2 },
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, title);
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
