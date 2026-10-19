import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { dateForSchoolYear, type ParsedGradePage } from './grade-pdf';

const run = promisify(execFile);
const MAX_PAGES = 20;

type Line = { at: number; width: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type OcrCell = { text: string; confidence: number };

function dark(image: PNG, x: number, y: number) {
  const offset = (y * image.width + x) * 4;
  return (
    image.data[offset + 3] > 100 &&
    image.data[offset] + image.data[offset + 1] + image.data[offset + 2] < 420
  );
}

function cluster(values: number[]): Line[] {
  const groups: number[][] = [];
  for (const value of values) {
    const last = groups.at(-1);
    if (last && value <= last.at(-1)! + 1) last.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => ({
    at: Math.round(group.reduce((sum, value) => sum + value, 0) / group.length),
    width: group.length,
  }));
}

export function locateGradeGrid(image: PNG) {
  const left = Math.round(image.width * 0.04);
  const right = Math.round(image.width * 0.94);
  const top = Math.round(image.height * 0.18);
  const bottom = Math.round(image.height * 0.73);
  const columns = cluster(
    Array.from({ length: image.width }, (_, x) => x).filter((x) => {
      let ink = 0;
      for (let y = top; y < bottom; y++) if (dark(image, x, y)) ink++;
      return ink > (bottom - top) * 0.84;
    }),
  ).map((line) => line.at);
  const rows = cluster(
    Array.from({ length: image.height }, (_, y) => y).filter((y) => {
      let ink = 0;
      for (let x = left; x < right; x++) if (dark(image, x, y)) ink++;
      return ink > (right - left) * 0.82;
    }),
  ).map((line) => line.at);
  const nameGap = columns
    .slice(0, -1)
    .map((x, index) => ({ index, gap: columns[index + 1] - x }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (!nameGap || nameGap.gap < image.width * 0.14)
    throw new Error('Не найдена колонка с ФИО');
  const dataStart = rows.findIndex(
    (y, index) =>
      index > 0 &&
      index < rows.length - 2 &&
      y - rows[index - 1] > image.height * 0.035 &&
      rows[index + 1] - y < image.height * 0.025,
  );
  if (dataStart < 1 || rows.length - dataStart < 2)
    throw new Error('Не найдены строки журнала');
  return {
    nameLeft: columns[nameGap.index],
    nameRight: columns[nameGap.index + 1],
    gradeColumns: columns.slice(nameGap.index + 1),
    rowLines: rows.slice(dataStart),
    dateTop: rows[dataStart - 1],
    dateBottom: rows[dataStart],
    tableTop: rows[0],
  };
}

function crop(image: PNG, rect: Rect, rotate = false) {
  const sourceWidth = Math.max(1, rect.right - rect.left);
  const sourceHeight = Math.max(1, rect.bottom - rect.top);
  const scale = 3;
  const padding = 8;
  const width = (rotate ? sourceHeight : sourceWidth) * scale + padding * 2;
  const height = (rotate ? sourceWidth : sourceHeight) * scale + padding * 2;
  const result = new PNG({ width, height, colorType: 6 });
  result.data.fill(255);
  let ink = 0;
  for (let sy = 0; sy < sourceHeight; sy++) {
    for (let sx = 0; sx < sourceWidth; sx++) {
      const x = rect.left + sx;
      const y = rect.top + sy;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if (dark(image, x, y)) ink++;
      const source = (y * image.width + x) * 4;
      const dx = rotate ? sourceHeight - 1 - sy : sx;
      const dy = rotate ? sx : sy;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const target =
            ((padding + dy * scale + py) * width + padding + dx * scale + px) *
            4;
          image.data.copy(result.data, target, source, source + 4);
        }
      }
    }
  }
  return { data: PNG.sync.write(result), ink };
}

async function recognize(worker: Worker, data: Buffer): Promise<OcrCell> {
  const result = await worker.recognize(data);
  return {
    text: result.data.text.replace(/\s+/g, ' ').trim(),
    confidence: result.data.confidence,
  };
}

function gradeValue(text: string) {
  const clean = text.replace(/[|.,\s]/g, '').toLocaleLowerCase('ru-RU');
  if (/^[2-5]$/.test(clean)) return clean;
  if (/^[нh][б6bь]$/.test(clean)) return 'нб';
  return '';
}

function dateValue(text: string, schoolYearStart: number) {
  const clean = text
    .replace(/[ОоOo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[,-]/g, '.');
  const match = /(\d{1,2})\s*[.]\s*(\d{1,2})/.exec(clean);
  return match
    ? dateForSchoolYear(`${match[1]}.${match[2]}`, schoolYearStart)
    : null;
}

export async function extractGradeXpsPage(
  imageBuffer: Buffer,
  schoolYearStart: number,
  worker: Worker,
  numberWorker?: Worker,
): Promise<ParsedGradePage & { previewImage: string }> {
  const image = PNG.sync.read(imageBuffer);
  if (image.width > 4000 || image.height > 6000)
    throw new Error('Страница XPS слишком велика');
  const grid = locateGradeGrid(image);
  const subjectOcr = await recognize(
    worker,
    crop(image, {
      left: Math.round(image.width * 0.17),
      top: Math.max(0, grid.tableTop - Math.round(image.height * 0.035)),
      right: Math.round(image.width * 0.85),
      bottom: grid.tableTop - 8,
    }).data,
  );
  const subject = subjectOcr.text
    .replace(/^.*?наименование\s+предмета\s*/i, '')
    .trim();
  const dates: { date: string; columnIndex: number; needsReview?: boolean }[] =
    [];
  let emptyDates = 0;
  for (
    let columnIndex = 0;
    columnIndex < grid.gradeColumns.length - 1;
    columnIndex++
  ) {
    const cell = crop(
      image,
      {
        left: grid.gradeColumns[columnIndex] + 2,
        right: grid.gradeColumns[columnIndex + 1] - 2,
        top: grid.dateTop + 2,
        bottom: grid.dateBottom - 2,
      },
      true,
    );
    if (cell.ink < 8) {
      if (dates.length && ++emptyDates >= 2) break;
      continue;
    }
    emptyDates = 0;
    const read = await recognize(worker, cell.data);
    const date = dateValue(read.text, schoolYearStart) ?? '';
    dates.push({
      date,
      columnIndex,
      needsReview: !date || read.confidence < 65,
    });
  }
  if (!dates.length) throw new Error('Не найдены даты журнала');

  const rows: ParsedGradePage['rows'] = [];
  for (let index = 0; index < grid.rowLines.length - 1 && index < 60; index++) {
    const top = grid.rowLines[index] + 2;
    const bottom = grid.rowLines[index + 1] - 2;
    const nameCell = crop(image, {
      left: grid.nameLeft + 3,
      right: grid.nameRight - 3,
      top,
      bottom,
    });
    if (nameCell.ink < 10) {
      if (rows.length) break;
      continue;
    }
    const name = (await recognize(worker, nameCell.data)).text;
    if (name.length < 5) continue;
    const grades: ParsedGradePage['rows'][number]['grades'] = [];
    for (const date of dates) {
      const cell = crop(image, {
        left: grid.gradeColumns[date.columnIndex] + 2,
        right: grid.gradeColumns[date.columnIndex + 1] - 2,
        top,
        bottom,
      });
      if (cell.ink < 5) continue;
      let read = await recognize(worker, cell.data);
      let value = gradeValue(read.text);
      if (!value && numberWorker) {
        const alternative = await recognize(numberWorker, cell.data);
        const alternativeValue = gradeValue(alternative.text);
        if (alternativeValue) {
          read = alternative;
          value = alternativeValue;
        }
      }
      grades.push({
        date: date.date,
        columnIndex: date.columnIndex,
        value,
        needsReview: !value || read.confidence < 65,
        raw: read.text.slice(0, 12),
      });
    }
    rows.push({ name, grades });
  }
  if (!rows.length) throw new Error('Не найдены студенты журнала');
  return {
    subject,
    dates,
    rows,
    previewImage: `data:image/png;base64,${imageBuffer.toString('base64')}`,
  };
}

export async function parseGradeXps(data: Buffer, schoolYearStart: number) {
  const directory = await mkdtemp(join(tmpdir(), 'grade-xps-'));
  const source = join(directory, 'journal.xps');
  try {
    await writeFile(source, data);
    await run('xpstopng', ['-r', '144', source, join(directory, 'page')], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    const pages = (await readdir(directory))
      .filter((name) => /^page-?\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!pages.length || pages.length > MAX_PAGES)
      throw new Error('Не удалось прочитать страницы XPS');
    const worker = await createWorker('rus', 1, {
      langPath: dirname(
        require.resolve('@tesseract.js-data/rus/4.0.0/rus.traineddata.gz'),
      ),
      gzip: true,
      cacheMethod: 'none',
    });
    try {
      const numberWorker = await createWorker('eng', 1, {
        langPath: dirname(
          require.resolve('@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'),
        ),
        gzip: true,
        cacheMethod: 'none',
      });
      try {
        await Promise.all([
          worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }),
          numberWorker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_LINE,
          }),
        ]);
        const result = [];
        for (const page of pages) {
          result.push(
            await extractGradeXpsPage(
              await readFile(join(directory, page)),
              schoolYearStart,
              worker,
              numberWorker,
            ),
          );
        }
        return result;
      } finally {
        await numberWorker.terminate();
      }
    } finally {
      await worker.terminate();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
