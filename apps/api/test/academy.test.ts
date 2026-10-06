import { describe, expect, it } from 'vitest';
import {
  parseBellSchedule,
  parseChangePdfUrl,
  parseGroupId,
  parseGroupLessons,
} from '../src/integrations/academy/academy-parser';

describe('academy parser', () => {
  it('finds the exact group and ignores similarly named groups', () => {
    const html = `<select id="gruppa">
      <option value="other">Ис-2611</option>
      <option value="3b961837-2be7-11f1-8da9-000c29a2748e\n">Ис-2612\n</option>
    </select>`;
    expect(parseGroupId(html, 'ИС-2612')).toBe(
      '3b961837-2be7-11f1-8da9-000c29a2748e',
    );
  });

  it('parses a real schedule row into a dated lesson', () => {
    const html = `<div class="table"><div class="table-body">
      <div class="table-body_item">
        <div class="time"><span class="title">Пара:</span> 3</div>
        <div class="group"><span class="title">Группа:</span> Ис-2612</div>
        <div class="lesson">БПр.01 Русский язык<span class="subgroup"></span></div>
        <div class="teacher">Черемухина Татьяна Сергеевна</div>
        <div class="territory">УЧЕБНЫЙ КОРПУС № 3 ул. Г. ТИТОВА, 8</div>
        <div class="classroom"><span class="title">Каб: </span> 208</div>
      </div></div></div>`;
    expect(parseGroupLessons(html, 'ИС-2612')).toEqual([
      {
        lessonNumber: 3,
        subject: 'БПр.01 Русский язык',
        teacher: 'Черемухина Татьяна Сергеевна',
        room: '208',
        building: 'УЧЕБНЫЙ КОРПУС № 3 ул. Г. ТИТОВА, 8',
        subgroup: '',
      },
    ]);
  });

  it('rejects rows for another group', () => {
    const html =
      '<div class="table-body_item"><div class="time">3</div><div class="group">Ис-2611</div></div>';
    expect(() => parseGroupLessons(html, 'ИС-2612')).toThrow();
  });

  it('reads separate Monday and weekday bell times', () => {
    const html =
      '<table id="table"><tr><th>Пара</th><th>Время (Пн)</th><th>Время (Вт-Пт)</th><th>Время (Сб)</th></tr><tr><td>3 пара</td><td>12:20 - 13:50</td><td>11:30 - 13:00</td><td>11:30 - 13:00</td></tr></table>';
    expect(parseBellSchedule(html)).toEqual([
      {
        dayScheme: 'MON',
        lessonNumber: 3,
        startTime: '12:20',
        endTime: '13:50',
      },
      {
        dayScheme: 'TUE_FRI',
        lessonNumber: 3,
        startTime: '11:30',
        endTime: '13:00',
      },
      {
        dayScheme: 'SAT',
        lessonNumber: 3,
        startTime: '11:30',
        endTime: '13:00',
      },
    ]);
  });

  it('selects a change PDF from the requested month', () => {
    const html =
      '<div>Сентябрь - 2026</div><table><tr><td><a href="/old.pdf">2</a></td></tr></table><div>Октябрь - 2026</div><table><tr><td><a href="/new.pdf">2</a></td></tr></table>';
    expect(parseChangePdfUrl(html, '2026-10-02')).toBe(
      'https://altag.ru/new.pdf',
    );
  });
});
