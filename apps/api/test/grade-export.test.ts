import { describe, expect, it } from 'vitest';
import { renderStudentGradesPdf } from '../src/modules/grades/grade-export';

describe('grade PDF export', () => {
  it('creates a printable PDF with Cyrillic names, subjects, dates and values', async () => {
    const pdf = await renderStudentGradesPdf('Иванов Иван', [
      {
        subject: 'Русский язык',
        date: new Date('2026-10-01T00:00:00Z'),
        value: '5',
      },
      {
        subject: 'Русский язык',
        date: new Date('2026-10-08T00:00:00Z'),
        value: 'нб',
      },
      {
        subject: 'Математика',
        date: new Date('2026-10-09T00:00:00Z'),
        value: '4',
      },
    ]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: true,
    });
    try {
      const document = await task.promise;
      const content = await (await document.getPage(1)).getTextContent();
      const text = content.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      expect(text).toContain('Иванов Иван');
      expect(text).toContain('Русский язык');
      expect(text).toContain('Математика');
      expect(text).toContain('01.10.2026');
      expect(text).toContain('нб');
      const dateItem = content.items.find(
        (item) => 'str' in item && item.str === '01.10.2026',
      );
      const gradeItem = content.items.find(
        (item) => 'str' in item && item.str === '5',
      );
      expect(
        dateItem && 'transform' in dateItem ? dateItem.transform[5] : 0,
      ).toBeGreaterThan(
        gradeItem && 'transform' in gradeItem
          ? gradeItem.transform[5]
          : Number.POSITIVE_INFINITY,
      );
    } finally {
      await task.destroy();
    }
  });
});
