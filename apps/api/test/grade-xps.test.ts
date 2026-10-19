import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { locateGradeGrid } from '../src/modules/grades/grade-xps';

function blankPage() {
  const image = new PNG({ width: 1190, height: 1683 });
  image.data.fill(255);
  return image;
}

function line(image: PNG, x: number, y: number) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = 0;
  image.data[offset + 1] = 0;
  image.data[offset + 2] = 0;
}

describe('XPS grade journal grid', () => {
  it('locates the name, date and grade cells by the printed table lines', () => {
    const image = blankPage();
    const columns = [57, 82, 354, 382, 411, 440, 469];
    const rows = [
      225, 246, 319, 340, 361, 382, 403, 424, 445, 466, 487, 508, 529, 550, 571,
      592, 613, 634, 655, 676, 697, 718, 739, 760, 781, 802, 823, 844, 865, 886,
      907, 928, 949, 970, 991, 1012, 1033, 1054, 1075, 1096, 1117, 1138, 1159,
      1180, 1201, 1222,
    ];
    for (const x of columns) {
      for (let y = 225; y <= 1222; y++) line(image, x, y);
    }
    for (const y of rows) {
      for (let x = 57; x <= 1106; x++) line(image, x, y);
    }
    const grid = locateGradeGrid(image);
    expect(grid.nameLeft).toBe(82);
    expect(grid.nameRight).toBe(354);
    expect(grid.gradeColumns.slice(0, 4)).toEqual([354, 382, 411, 440]);
    expect(grid.dateTop).toBe(246);
    expect(grid.dateBottom).toBe(319);
    expect(grid.rowLines.slice(0, 3)).toEqual([319, 340, 361]);
  });

  it('rejects a page without a journal table', () => {
    expect(() => locateGradeGrid(blankPage())).toThrow('Не найдена колонка');
  });
});
