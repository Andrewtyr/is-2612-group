import { load } from 'cheerio';

export type AcademyLesson = {
  lessonNumber: number;
  subject: string;
  teacher: string;
  room: string;
  building: string;
  subgroup: string;
};
export type AcademyBell = {
  dayScheme: 'MON' | 'TUE_FRI' | 'SAT';
  lessonNumber: number;
  startTime: string;
  endTime: string;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function groupKey(value: string): string {
  return normalize(value).toLocaleLowerCase('ru-RU');
}

export function parseGroupId(html: string, groupName: string): string {
  const $ = load(html);
  let id = '';
  $('#gruppa option').each((_, option) => {
    if (groupKey($(option).text()) === groupKey(groupName)) {
      id = normalize($(option).attr('value') ?? '');
    }
  });
  if (!/^[a-f0-9-]{36}$/i.test(id))
    throw new Error(`Группа ${groupName} не найдена в источнике академии`);
  return id;
}

export function parseGroupLessons(
  html: string,
  groupName: string,
): AcademyLesson[] {
  const $ = load(html);
  const rows = $('.table-body_item');
  const result: AcademyLesson[] = [];
  rows.each((_, row) => {
    const group = groupKey(
      $(row).find('.group').clone().find('.title').remove().end().text(),
    );
    if (group !== groupKey(groupName)) return;
    const numberText = normalize(
      $(row).find('.time').clone().find('.title').remove().end().text(),
    );
    const lessonNumber = Number(numberText);
    const subject = normalize(
      $(row).find('.lesson').clone().find('.subgroup').remove().end().text(),
    );
    const subgroup = normalize($(row).find('.lesson .subgroup').text());
    const teacher = normalize($(row).find('.teacher').text());
    const room = normalize(
      $(row).find('.classroom').clone().find('.title').remove().end().text(),
    );
    const building = normalize($(row).find('.territory').text());
    if (
      !Number.isInteger(lessonNumber) ||
      lessonNumber < 1 ||
      lessonNumber > 12 ||
      !subject
    ) {
      throw new Error('Источник академии вернул неполное занятие');
    }
    result.push({ lessonNumber, subject, teacher, room, building, subgroup });
  });
  if (rows.length > 0 && result.length === 0)
    throw new Error('Источник вернул занятия другой группы');
  return result;
}

export function parseBellSchedule(html: string): AcademyBell[] {
  const $ = load(html);
  const bells: AcademyBell[] = [];
  $('#table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const number = Number(
      normalize($(cells[0]).text()).match(/^(\d+) пара$/)?.[1],
    );
    if (!number) return;
    (['MON', 'TUE_FRI', 'SAT'] as const).forEach((dayScheme, index) => {
      const match = normalize($(cells[index + 1]).text()).match(
        /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/,
      );
      if (match)
        bells.push({
          dayScheme,
          lessonNumber: number,
          startTime: match[1].padStart(5, '0'),
          endTime: match[2].padStart(5, '0'),
        });
    });
  });
  if (bells.length === 0) throw new Error('Расписание звонков не распознано');
  return bells;
}

const monthNames = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function parseChangePdfUrl(html: string, date: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day || month > 12)
    throw new Error('Неверная дата изменений');
  const $ = load(html);
  let url: string | null = null;
  $('table').each((_, table) => {
    const heading = normalize($(table).prev().text());
    if (!heading.includes(`${monthNames[month - 1]} - ${year}`)) return;
    $(table)
      .find('a[href$=".pdf"]')
      .each((__, link) => {
        if (Number(normalize($(link).text())) !== day) return;
        const candidate = new URL(
          $(link).attr('href') ?? '',
          'https://altag.ru',
        );
        if (
          candidate.hostname !== 'altag.ru' ||
          !candidate.pathname.endsWith('.pdf')
        ) {
          throw new Error('Недопустимая ссылка на изменения');
        }
        url = candidate.href;
      });
  });
  return url;
}
