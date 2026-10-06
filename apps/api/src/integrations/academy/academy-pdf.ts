export type PdfTextItem = { str: string; x: number; y: number };
export type PdfChange = {
  lessonNumber: number;
  subject: string;
  teacher: string;
  room: string;
  status: 'CHANGED' | 'CANCELLED';
};

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function key(value: string) {
  return clean(value).toLocaleLowerCase('ru-RU');
}

function subjectKey(value: string) {
  return key(value)
    .replace(/^[а-яa-z]+\.\d+(?:\.\d+)?\s*/i, '')
    .replace(/ё/g, 'е');
}

export function sameOfficialLesson(
  base: { subject: string; teacher: string; room: string },
  change: PdfChange,
): boolean {
  if (change.status === 'CANCELLED') return false;
  const pdfSubject = subjectKey(change.subject);
  const baseSubject = subjectKey(base.subject);
  const subjectMatches =
    baseSubject === pdfSubject ||
    baseSubject.includes(pdfSubject) ||
    (pdfSubject === 'обзр' &&
      baseSubject === 'основы безопасности и защиты родины');
  const teacherMatches =
    key(base.teacher).replace(/ё/g, 'е').split(' ')[0] ===
    key(change.teacher).replace(/ё/g, 'е').split(' ')[0];
  return (
    subjectMatches && teacherMatches && key(base.room) === key(change.room)
  );
}

function lines(items: PdfTextItem[]) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const result: { y: number; text: string }[] = [];
  for (const item of sorted) {
    const line = result.find((candidate) => Math.abs(candidate.y - item.y) < 3);
    if (line) line.text = clean(`${line.text} ${item.str}`);
    else result.push({ y: item.y, text: clean(item.str) });
  }
  return result.filter((line) => line.text).sort((a, b) => b.y - a.y);
}

export function extractGroupChanges(
  items: PdfTextItem[],
  groupName: string,
): PdfChange[] {
  const result: PdfChange[] = [];
  const headers = items.filter((item) => key(item.str) === key(groupName));
  for (const header of headers) {
    const cab = items
      .filter(
        (item) =>
          key(item.str) === 'каб' &&
          Math.abs(item.y - header.y) < 4 &&
          item.x > header.x &&
          item.x < header.x + 130,
      )
      .sort((a, b) => a.x - b.x)[0];
    if (!cab) continue;
    const nextHeaderY = Math.max(
      -Infinity,
      ...items
        .filter(
          (item) => item.str === '№' && item.x < 45 && item.y < header.y - 10,
        )
        .map((item) => item.y),
    );
    const previousCab = items
      .filter(
        (item) =>
          key(item.str) === 'каб' &&
          Math.abs(item.y - header.y) < 4 &&
          item.x < header.x,
      )
      .sort((a, b) => b.x - a.x)[0];
    const subjectStart = previousCab ? previousCab.x + 15 : header.x - 70;
    const rows = items
      .filter(
        (item) =>
          /^\d{1,2}$/.test(clean(item.str)) &&
          item.x < 40 &&
          item.y < header.y - 10 &&
          item.y > nextHeaderY + 5,
      )
      .map((item) => ({ lessonNumber: Number(item.str), y: item.y }))
      .sort((a, b) => b.y - a.y);
    for (const row of rows) {
      const nextRowY =
        rows.find((candidate) => candidate.y < row.y)?.y ?? nextHeaderY;
      const subjectItems = items.filter(
        (item) =>
          item.y <= row.y + 2 &&
          item.y > nextRowY + 2 &&
          item.x >= subjectStart &&
          item.x < cab.x - 8 &&
          clean(item.str),
      );
      const roomItems = items.filter(
        (item) =>
          item.y <= row.y + 2 &&
          item.y > nextRowY + 2 &&
          item.x >= cab.x - 10 &&
          item.x < cab.x + 20 &&
          clean(item.str),
      );
      const subjectLines = lines(subjectItems);
      if (!subjectLines.length) continue;
      const first = subjectLines[0].text;
      const cancelled = /отмена|отменена|отменено/i.test(first);
      result.push({
        lessonNumber: row.lessonNumber,
        subject: cancelled ? '' : first,
        teacher: cancelled
          ? ''
          : subjectLines
              .slice(1)
              .map((line) => line.text)
              .join(' '),
        room: cancelled
          ? ''
          : lines(roomItems)
              .map((line) => line.text)
              .join('/')
              .replace(/\/+/g, '/'),
        status: cancelled ? 'CANCELLED' : 'CHANGED',
      });
    }
  }
  return result;
}

export async function parsePdfChanges(
  data: Uint8Array,
  groupName: string,
): Promise<PdfChange[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const document = await task.promise;
  try {
    const result: PdfChange[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = content.items
        .filter(
          (item): item is typeof item & { str: string; transform: number[] } =>
            'str' in item && 'transform' in item,
        )
        .map((item) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
        }));
      result.push(...extractGroupChanges(items, groupName));
    }
    return result;
  } finally {
    await task.destroy();
  }
}
