import { describe, expect, it } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { buildMonthlyReport } from '../src/modules/attendance/monthly-report';
import { renderMonthlyReportXlsx } from '../src/modules/attendance/monthly-report-xlsx';

describe('monthly attendance Excel export', () => {
  it('puts two reason columns under each date and totals at the end', () => {
    const report = buildMonthlyReport(
      '2026-10',
      [{ id: 's1', firstName: 'Иван', lastName: 'Петров' }],
      [], [],
      [{ studentId: 's1', date: new Date('2026-10-12'), unexcusedHours: 2, excusedHours: 4 }],
    );
    const workbook = XLSX.read(renderMonthlyReportXlsx(report, 'ИС-2612'), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets['Октябрь 2026'], {
      header: 1, defval: '',
    });
    expect(rows[2][24]).toBe(12);
    expect(rows[3][24]).toBe('неув');
    expect(rows[3][25]).toBe('ув');
    expect(rows[4][24]).toBe(2);
    expect(rows[4][25]).toBe(4);
    expect(rows[4][64]).toBe(6);
    expect(rows[4][65]).toBe(4);
    expect(rows[4][66]).toBe(2);
  });
});
