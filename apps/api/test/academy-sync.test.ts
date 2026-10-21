import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcademyService } from '../src/integrations/academy/academy.service';
import type { PrismaService } from '../src/database/prisma.service';

function lesson(number: number, subject: string) {
  return `<div class="table-body_item">
    <div class="time"><span class="title">Пара:</span> ${number}</div>
    <div class="group"><span class="title">Группа:</span> ИС-2612</div>
    <div class="lesson">${subject}<span class="subgroup"></span></div>
    <div class="teacher"></div><div class="territory"></div>
    <div class="classroom"><span class="title">Каб:</span></div>
  </div>`;
}

describe('academy synchronization', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the class hour and ordinary fourth lesson in distinct Monday slots', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T17:00:00Z'));
    type Saved = {
      id: string;
      lessonNumber: number;
      subgroup: string;
      startTime: string;
      endTime: string;
      source: string;
      status: string;
      room: string;
      subject: { name: string } | null;
      teacher: { name: string } | null;
    };
    const saved = new Map<string, Saved>();
    const keyOf = (value: { lessonNumber: number; subgroup: string }) =>
      `${value.lessonNumber}:${value.subgroup}`;
    const tx = {
      subject: {
        upsert: vi.fn(async (args: { create: { name: string } }) => ({
          id: args.create.name,
        })),
      },
      teacher: {
        upsert: vi.fn(async (args: { create: { name: string } }) => ({
          id: args.create.name,
        })),
      },
      lesson: {
        upsert: vi.fn(
          async (args: {
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const key = keyOf(args.create as Saved);
            const data: Record<string, unknown> = {
              ...(saved.get(key) ?? {}),
              ...(saved.has(key) ? args.update : args.create),
            };
            const result: Saved = {
              ...data,
              id: key,
              subject: data.subjectId ? { name: String(data.subjectId) } : null,
              teacher: data.teacherId ? { name: String(data.teacherId) } : null,
            } as Saved;
            saved.set(key, result);
            return result;
          },
        ),
      },
      scheduleChange: { create: vi.fn(async () => undefined) },
      auditLog: { create: vi.fn(async () => undefined) },
      groupMember: { findMany: vi.fn(async () => []) },
    };
    const syncUpdate = vi.fn(async () => undefined);
    const prisma = {
      group: {
        findUnique: vi.fn(async () => ({ id: 'group-1', name: 'ИС-2612' })),
      },
      syncState: { upsert: vi.fn(async () => undefined), update: syncUpdate },
      bellSchedule: { upsert: vi.fn(async () => undefined) },
      lesson: {
        findUnique: vi.fn(
          async (args: {
            where: { groupId_date_lessonNumber_subgroup: Saved };
          }) =>
            saved.get(keyOf(args.where.groupId_date_lessonNumber_subgroup)) ??
            null,
        ),
        findMany: vi.fn(async () => []),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    };
    const service = new AcademyService(prisma as unknown as PrismaService);
    const bells = `<table id="table">
      ${[1, 2, 3].map((n) => `<tr><td>${n} пара</td><td>12:20 - 13:50</td><td>11:30 - 13:00</td><td>11:30 - 13:00</td></tr>`).join('')}
      <tr><td>классный час</td><td>13:55 - 14:40</td><td></td><td></td></tr>
      <tr><td>4 пара</td><td>14:50 - 16:20</td><td>13:10 - 14:40</td><td>13:05 - 14:35</td></tr>
      <tr><td>5 пара</td><td>16:40 - 18:10</td><td>14:50 - 16:20</td><td>14:55 - 16:25</td></tr>
      <tr><td>6 пара</td><td>18:15 - 19:45</td><td>16:40 - 18:10</td><td>16:30 - 18:00</td></tr>
    </table>`;
    Object.assign(service, {
      post: vi.fn(async (path: string, values: { calendar?: string }) =>
        path === 'filter_grup.php'
          ? '<select id="gruppa"><option value="3b961837-2be7-11f1-8da9-000c29a2748e">ИС-2612</option></select>'
          : values.calendar === '2026-10-19'
            ? `<div class="table-body">${lesson(4, 'Классный час «Разговоры о важном»')}${lesson(5, 'Физическая культура')}${lesson(6, 'ОБЗР')}${lesson(7, 'Математика')}</div>`
            : '<div class="table-body"></div>',
      ),
      getText: vi.fn(async (url: string) =>
        url.includes('call_schedule')
          ? bells
          : '<div>Октябрь - 2026</div><table><tr><td><a href="/daily.pdf">19</a></td></tr></table>',
      ),
      loadPdf: vi.fn(async () => [
        {
          lessonNumber: 4,
          subject: 'Классный час',
          teacher: '',
          room: '305',
          status: 'CHANGED',
          classHour: true,
        },
        {
          lessonNumber: 4,
          subject: 'Физическая культура',
          teacher: '',
          room: '109',
          status: 'CHANGED',
        },
        {
          lessonNumber: 5,
          subject: 'ОБЗР',
          teacher: '',
          room: '210',
          status: 'CHANGED',
        },
        {
          lessonNumber: 6,
          subject: 'Математика',
          teacher: '',
          room: '211',
          status: 'CHANGED',
        },
      ]),
    });

    const result = await service.sync();

    expect(result.status).toBe('ok');
    expect(result.warning).toBeNull();
    expect([...saved.keys()].sort()).toEqual([
      '4:',
      '4:__CLASS_HOUR__',
      '5:',
      '6:',
    ]);
    expect(saved.get('4:__CLASS_HOUR__')).toMatchObject({
      startTime: '13:55',
      endTime: '14:40',
    });
    expect(saved.get('4:')).toMatchObject({
      startTime: '14:50',
      endTime: '16:20',
    });
    expect(saved.get('5:')).toMatchObject({
      startTime: '16:40',
      endTime: '18:10',
    });
    expect(saved.get('6:')).toMatchObject({
      startTime: '18:15',
      endTime: '19:45',
    });
    expect(syncUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: null }),
      }),
    );
  });

  it('updates known-time lessons while reporting Monday seventh without an official time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T17:00:00Z'));
    const updates: Array<Record<string, unknown>> = [];
    const saved: Array<Record<string, unknown>> = [];
    const tx = {
      subject: { upsert: vi.fn(async () => ({ id: 'subject-1' })) },
      teacher: { upsert: vi.fn(async () => ({ id: 'teacher-1' })) },
      lesson: {
        upsert: vi.fn(async (args: { create: Record<string, unknown> }) => {
          saved.push(args.create);
          return { id: 'lesson-1' };
        }),
      },
    };
    const prisma = {
      group: {
        findUnique: vi.fn(async () => ({ id: 'group-1', name: 'ИС-2612' })),
      },
      syncState: {
        upsert: vi.fn(async () => undefined),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
        }),
      },
      bellSchedule: { upsert: vi.fn(async () => undefined) },
      lesson: {
        findUnique: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    };
    const service = new AcademyService(prisma as unknown as PrismaService);
    const bells = `<table id="table">
      ${[1, 2, 3]
        .map(
          (number) =>
            `<tr><td>${number} пара</td><td>14:50 - 16:20</td><td>13:10 - 14:40</td><td>13:05 - 14:35</td></tr>`,
        )
        .join('')}
      <tr><td>классный час</td><td>13:55 - 14:40</td><td></td><td></td></tr>
      ${[4, 5, 6]
        .map(
          (number) =>
            `<tr><td>${number} пара</td><td>14:50 - 16:20</td><td>13:10 - 14:40</td><td>13:05 - 14:35</td></tr>`,
        )
        .join('')}
      <tr><td>7 пара</td><td></td><td>18:15 - 19:45</td><td></td></tr>
    </table>`;
    const post = vi.fn(async (path: string, values: { calendar?: string }) =>
      path === 'filter_grup.php'
        ? '<select id="gruppa"><option value="3b961837-2be7-11f1-8da9-000c29a2748e">ИС-2612</option></select>'
        : values.calendar === '2026-10-19'
          ? `<div class="table-body">${lesson(3, 'Русский язык')}${lesson(7, 'Математика')}</div>`
          : values.calendar === '2026-10-20'
            ? `<div class="table-body">${lesson(2, 'Русский язык')}</div>`
            : '<div class="table-body"></div>',
    );
    Object.assign(service, {
      post,
      getText: vi.fn(async (url: string) =>
        url.includes('call_schedule') ? bells : '',
      ),
    });

    const result = await service.sync();

    expect(result.status).toBe('partial');
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      lessonNumber: 3,
      startTime: '14:50',
      endTime: '16:20',
    });
    expect(saved[1]).toMatchObject({ lessonNumber: 2 });
    expect(updates.at(-1)).toMatchObject({
      lastSuccess: expect.any(Date),
      lastError: expect.stringContaining('7 пара'),
    });
    expect(post).toHaveBeenCalledTimes(7);
  });
});
