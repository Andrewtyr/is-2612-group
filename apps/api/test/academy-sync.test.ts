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
      lesson: { findUnique: vi.fn(async () => null) },
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
          ? `<div class="table-body">${lesson(4, 'Классный час «Разговоры о важном»')}${lesson(7, 'Математика')}</div>`
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
      lessonNumber: 4,
      startTime: '13:55',
      endTime: '14:40',
    });
    expect(saved[1]).toMatchObject({ lessonNumber: 2 });
    expect(updates.at(-1)).toMatchObject({
      lastSuccess: expect.any(Date),
      lastError: expect.stringContaining('7 пара'),
    });
    expect(post).toHaveBeenCalledTimes(7);
  });
});
