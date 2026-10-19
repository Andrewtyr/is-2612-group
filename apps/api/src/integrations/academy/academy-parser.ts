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
  dayScheme: 'MON' | 'MON_CLASS_HOUR' | 'TUE_FRI' | 'SAT';
  lessonNumber: number;
  startTime: string;
  endTime: string;
};

export const CLASS_HOUR_SUBGROUP = '__CLASS_HOUR__';

export function normalizeMondayLessons(
  lessons: AcademyLesson[],
): AcademyLesson[] {
  const isClassHour = (lesson: AcademyLesson) =>
    /^классный\s+час/i.test(lesson.subject.trim());
  const classHours = lessons.filter(isClassHour);
  if (classHours.length !== 1) return lessons;
  const classHourNumber = classHours[0].lessonNumber;
  const numberedAfterClassHour =
    !lessons.some(
      (lesson) =>
        !isClassHour(lesson) && lesson.lessonNumber === classHourNumber,
    ) && lessons.some((lesson) => lesson.lessonNumber > classHourNumber);
  return lessons.map((lesson) => {
    if (isClassHour(lesson))
      return { ...lesson, subgroup: CLASS_HOUR_SUBGROUP };
    if (numberedAfterClassHour && lesson.lessonNumber > classHourNumber)
      return { ...lesson, lessonNumber: lesson.lessonNumber - 1 };
    return lesson;
  });
}

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
    if (/^классный час$/i.test(normalize($(cells[0]).text()))) {
      const time = normalize($(cells[1]).text()).match(
        /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/,
      );
      let nextNumber = 0;
      for (const next of $(row).nextAll('tr').toArray()) {
        nextNumber = Number(
          normalize($(next).find('td').first().text()).match(
            /^(\d+) пара$/,
          )?.[1],
        );
        if (nextNumber) break;
      }
      if (time && nextNumber)
        bells.push({
          dayScheme: 'MON_CLASS_HOUR',
          lessonNumber: nextNumber,
          startTime: time[1].padStart(5, '0'),
          endTime: time[2].padStart(5, '0'),
        });
      return;
    }
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

export function selectLessonBell(
  bells: AcademyBell[],
  scheme: AcademyBell['dayScheme'],
  lessonNumber: number,
  subject: string,
): AcademyBell | undefined {
  const isClassHour =
    scheme === 'MON' && /^классный\s+час/i.test(normalize(subject));
  const targetScheme = isClassHour ? 'MON_CLASS_HOUR' : scheme;
  return bells.find(
    (bell) =>
      bell.dayScheme === targetScheme && bell.lessonNumber === lessonNumber,
  );
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
