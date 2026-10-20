import { describe, expect, it, vi } from 'vitest';
import { AttendanceController } from '../src/modules/attendance/attendance.controller';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuthRequest } from '../src/common/auth.guard';

describe('attendance raport', () => {
  it('rejects a student listed twice before changing attendance', async () => {
    const controller = new AttendanceController({} as PrismaService);
    const request = { user: { id: 'admin', role: 'ADMIN' } } as AuthRequest;
    await expect(
      controller.saveRaport(request, {
        date: '2026-10-19',
        lessonIds: ['math'],
        absences: [
          { studentId: 'anna', lessonIds: ['math'], status: 'ABSENT' },
          { studentId: 'anna', lessonIds: ['math'], status: 'EXCUSED' },
        ],
      }),
    ).rejects.toThrow('Студент указан дважды');
  });

  it('saves all selected lessons, records corrections, and does not duplicate unchanged marks', async () => {
    const stored = new Map<string, 'PRESENT' | 'ABSENT' | 'EXCUSED'>([
      ['math:anna', 'PRESENT'],
    ]);
    const upsert = vi.fn(
      async ({
        where,
        create,
      }: {
        where: { lessonId_studentId: { lessonId: string; studentId: string } };
        create: { status: 'PRESENT' | 'ABSENT' | 'EXCUSED' };
      }) => {
        const { lessonId, studentId } = where.lessonId_studentId;
        stored.set(`${lessonId}:${studentId}`, create.status);
        return { id: `${lessonId}:${studentId}` };
      },
    );
    const history = vi.fn(async () => ({}));
    const audit = vi.fn(async () => ({}));
    const notification = vi.fn(async () => ({}));
    const tx = {
      attendance: {
        findMany: vi.fn(async () =>
          [...stored].map(([key, status]) => {
            const [lessonId, studentId] = key.split(':');
            return { lessonId, studentId, status };
          }),
        ),
        upsert,
      },
      attendanceHistory: { create: history },
      auditLog: { create: audit },
      notification: { create: notification },
    };
    const prisma = {
      group: { findUnique: async () => ({ id: 'group' }) },
      lesson: {
        findMany: async () => [
          { id: 'math', status: 'PLANNED' },
          { id: 'history', status: 'PLANNED' },
        ],
      },
      groupMember: {
        findMany: async () => [{ userId: 'anna' }, { userId: 'boris' }],
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService;
    const controller = new AttendanceController(prisma);
    const request = { user: { id: 'admin', role: 'ADMIN' } } as AuthRequest;
    const body = {
      date: '2026-10-19',
      lessonIds: ['math', 'history'],
      absences: [{ studentId: 'anna', lessonIds: ['math'], status: 'EXCUSED' }],
    };

    expect(await controller.saveRaport(request, body)).toEqual({
      updated: 4,
      students: 2,
    });
    expect(history).toHaveBeenCalledTimes(4);
    expect(history).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attendanceId: 'math:anna',
        oldStatus: 'PRESENT',
        newStatus: 'EXCUSED',
      }),
    });
    expect(audit).toHaveBeenCalledTimes(4);
    expect(notification).toHaveBeenCalledTimes(2);

    expect(await controller.saveRaport(request, body)).toEqual({
      updated: 0,
      students: 0,
    });
    expect(upsert).toHaveBeenCalledTimes(4);
  });
});
