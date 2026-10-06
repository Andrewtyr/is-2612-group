import { describe, expect, it } from 'vitest';
import {
  extractGroupChanges,
  sameOfficialLesson,
  type PdfTextItem,
} from '../src/integrations/academy/academy-pdf';

const item = (str: string, x: number, y: number): PdfTextItem => ({
  str,
  x,
  y,
});

describe('extractGroupChanges', () => {
  it('keeps only the requested group column and its paired room column', () => {
    const items = [
      item('Ис-2611', 72, 438),
      item('каб', 150, 438),
      item('Ис-2612', 209, 438),
      item('каб', 287, 438),
      item('Ис-2613', 350, 438),
      item('каб', 450, 438),
      item('3', 17, 391),
      item('4', 17, 367),
      item('Физика', 50, 391),
      item('Русский язык', 180, 391),
      item('Черёмухина Т.С.', 180, 380),
      item('208', 282, 391),
      item('ОБЗР', 183, 367),
      item('Зимин Д.В.', 183, 356),
      item('211', 282, 367),
      item('История', 315, 367),
    ];
    expect(extractGroupChanges(items, 'ИС-2612')).toEqual([
      {
        lessonNumber: 3,
        subject: 'Русский язык',
        teacher: 'Черёмухина Т.С.',
        room: '208',
        status: 'CHANGED',
      },
      {
        lessonNumber: 4,
        subject: 'ОБЗР',
        teacher: 'Зимин Д.В.',
        room: '211',
        status: 'CHANGED',
      },
    ]);
  });

  it('recognizes an explicit cancellation', () => {
    const items = [
      item('Ис-2612', 209, 438),
      item('каб', 287, 438),
      item('4', 17, 367),
      item('отмена', 183, 367),
    ];
    expect(extractGroupChanges(items, 'ИС-2612')).toEqual([
      {
        lessonNumber: 4,
        subject: '',
        teacher: '',
        room: '',
        status: 'CANCELLED',
      },
    ]);
  });

  it('reads a wide group column without taking the previous room number', () => {
    const items = [
      item('Ис-2611', 84, 497),
      item('каб', 177, 498),
      item('Ис-2612', 257, 497),
      item('каб', 368, 498),
      item('4', 17, 419),
      item('5', 17, 394),
      item('208', 176, 420),
      item('Информатика', 204, 420),
      item('Курочкина Л.В./Павлюк А.А.', 204, 407),
      item('113/', 360, 420),
      item('112', 360, 407),
      item('211', 360, 394),
      item('Математика', 204, 394),
      item('Сердюкова А.Е.', 204, 381),
    ];
    expect(extractGroupChanges(items, 'ИС-2612')).toEqual([
      {
        lessonNumber: 4,
        subject: 'Информатика',
        teacher: 'Курочкина Л.В./Павлюк А.А.',
        room: '113/112',
        status: 'CHANGED',
      },
      {
        lessonNumber: 5,
        subject: 'Математика',
        teacher: 'Сердюкова А.Е.',
        room: '211',
        status: 'CHANGED',
      },
    ]);
  });

  it('keeps a multiline teacher within its lesson row', () => {
    const items = [
      item('Ис-2611', 96, 486),
      item('каб', 194, 486),
      item('Ис-2612', 262, 486),
      item('каб', 357, 486),
      item('6', 17, 352),
      item('7', 17, 310),
      item('Иностранный язык', 225, 352),
      item('Кривошеев К.С./', 225, 338),
      item('Конюкова Е.А.', 225, 325),
      item('206/', 353, 352),
      item('205', 353, 338),
      item('Физика', 225, 310),
      item('Маслаков Д.А.', 225, 296),
      item('217', 353, 310),
    ];
    expect(extractGroupChanges(items, 'ИС-2612')).toEqual([
      {
        lessonNumber: 6,
        subject: 'Иностранный язык',
        teacher: 'Кривошеев К.С./ Конюкова Е.А.',
        room: '206/205',
        status: 'CHANGED',
      },
      {
        lessonNumber: 7,
        subject: 'Физика',
        teacher: 'Маслаков Д.А.',
        room: '217',
        status: 'CHANGED',
      },
    ]);
  });

  it('treats an abbreviated PDF row as the same lesson when teacher and room agree', () => {
    expect(
      sameOfficialLesson(
        {
          subject: 'БПр.11 Основы безопасности и защиты Родины',
          teacher: 'Зимин Дмитрий Викторович',
          room: '211',
        },
        {
          lessonNumber: 4,
          subject: 'ОБЗР',
          teacher: 'Зимин Д.В.',
          room: '211',
          status: 'CHANGED',
        },
      ),
    ).toBe(true);
  });
});
