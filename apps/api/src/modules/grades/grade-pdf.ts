export type GradePdfItem = {
  str: string;
  x: number;
  y: number;
};

export type ParsedGradePage = {
  subject: string;
  dates: { date: string; columnIndex: number }[];
  rows: {
    name: string;
    grades: { date: string; columnIndex: number; value: string }[];
  }[];
};

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function dateForSchoolYear(value: string, schoolYearStart: number) {
  const match = /^(\d{1,2})[./](\d{1,2})$/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = month >= 8 ? schoolYearStart : schoolYearStart + 1;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

export function extractGradePage(
  items: GradePdfItem[],
  schoolYearStart: number,
): ParsedGradePage | null {
  const header = items.find((item) => /наименование предмета/i.test(item.str));
  if (!header) return null;
  const subjectLine = items
    .filter((item) => Math.abs(item.y - header.y) < 4 && item.x >= header.x - 3)
    .sort((a, b) => a.x - b.x)
    .map((item) => clean(item.str))
    .join(' ');
  const subject = clean(
    subjectLine.replace(/^.*?наименование предмета\s*/i, ''),
  );
  if (!subject) return null;

  const dateItems = items
    .map((item) => ({
      ...item,
      date: dateForSchoolYear(clean(item.str), schoolYearStart),
    }))
    .filter((item): item is GradePdfItem & { date: string } =>
      Boolean(item.date),
    )
    .sort((a, b) => a.x - b.x);
  if (!dateItems.length) return null;
  const firstDateX = dateItems[0].x;
  const numeric = items.filter(
    (item) => /^\d{1,2}$/.test(clean(item.str)) && item.x < firstDateX - 30,
  );
  const numberX = Math.min(...numeric.map((item) => item.x));
  const rowNumbers = numeric
    .filter(
      (item) =>
        Math.abs(item.x - numberX) < 8 &&
        Number(item.str) >= 1 &&
        Number(item.str) <= 60,
    )
    .sort((a, b) => b.y - a.y);
  const rows = rowNumbers.flatMap((numberItem) => {
    const name = clean(
      items
        .filter(
          (item) =>
            Math.abs(item.y - numberItem.y) < 3 &&
            item.x > numberItem.x + 7 &&
            item.x < firstDateX - 3,
        )
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join(' '),
    );
    if (name.length < 6 || !/[А-Яа-яЁё]/.test(name)) return [];
    const grades = items
      .filter(
        (item) =>
          Math.abs(item.y - numberItem.y) < 3 &&
          item.x >= firstDateX - 8 &&
          /^[2-5]$|^нб$/i.test(clean(item.str)),
      )
      .map((item) => {
        const columnIndex = dateItems.reduce(
          (best, date, index) =>
            Math.abs(date.x - item.x) < Math.abs(dateItems[best].x - item.x)
              ? index
              : best,
          0,
        );
        return {
          date: dateItems[columnIndex].date,
          columnIndex,
          value: clean(item.str).toLocaleLowerCase('ru-RU'),
        };
      });
    return [{ name, grades }];
  });
  return {
    subject,
    dates: dateItems.map((item, columnIndex) => ({
      date: item.date,
      columnIndex,
    })),
    rows,
  };
}

export async function parseGradePdf(data: Uint8Array, schoolYearStart: number) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const document = await task.promise;
  try {
    if (document.numPages > 100) throw new Error('В PDF слишком много страниц');
    const pages: ParsedGradePage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: GradePdfItem[] = content.items
        .filter(
          (item): item is typeof item & { str: string; transform: number[] } =>
            'str' in item && 'transform' in item,
        )
        .map((item) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
        }));
      const parsed = extractGradePage(items, schoolYearStart);
      if (parsed) pages.push(parsed);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
