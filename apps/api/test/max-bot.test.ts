import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaxBotService } from '../src/integrations/max/max-bot.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AcademyService } from '../src/integrations/academy/academy.service';
import { isoDate, todayInNovosibirsk } from '../src/common/group';

function bot() {
  return new MaxBotService({} as PrismaService, {} as AcademyService);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('MAX bot webhook', () => {
  it('rejects requests without a configured token and secret', () => {
    vi.stubEnv('MAX_BOT_MODE', 'webhook');
    vi.stubEnv('MAX_BOT_TOKEN', '');
    vi.stubEnv('MAX_WEBHOOK_SECRET', '');
    expect(bot().verifyWebhookSecret(undefined)).toBe(false);
    expect(bot().verifyWebhookSecret('anything')).toBe(false);
  });

  it('accepts only the exact secret in webhook mode', () => {
    vi.stubEnv('MAX_BOT_MODE', 'webhook');
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_WEBHOOK_URL', 'https://is2612.ru/api/max/webhook');
    vi.stubEnv('MAX_WEBHOOK_SECRET', 'secret_for_tests');
    expect(bot().verifyWebhookSecret('secret_for_tests')).toBe(true);
    expect(bot().verifyWebhookSecret('secret_for_test')).toBe(false);
    vi.stubEnv('MAX_BOT_MODE', 'polling');
    expect(bot().verifyWebhookSecret('secret_for_tests')).toBe(false);
  });

  it('does not subscribe when webhook settings are incomplete', async () => {
    vi.stubEnv('MAX_BOT_MODE', 'webhook');
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_WEBHOOK_URL', 'https://is2612.ru/api/max/webhook');
    vi.stubEnv('MAX_WEBHOOK_SECRET', '');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    bot().onModuleInit();
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('MAX bot messages', () => {
  it('shows the group roster and bulk actions in the lesson menu', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_ADMIN_USER_IDS', '42');
    const date = isoDate(todayInNovosibirsk());
    const students = Array.from({ length: 26 }, (_, index) => ({
      user: {
        id: `student-${index + 1}`,
        lastName: `Студент${index + 1}`,
        firstName: 'Иван',
      },
    }));
    const prisma = {
      group: { findUnique: vi.fn().mockResolvedValue({ id: 'group-1' }) },
      lesson: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'lesson-1',
          groupId: 'group-1',
          lessonNumber: 3,
          date,
          status: 'PLANNED',
          subject: { name: 'Литература' },
        }),
      },
      groupMember: { findMany: vi.fn().mockResolvedValue(students) },
      attendance: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ studentId: 'student-1', status: 'PRESENT' }]),
      },
    };
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);
    const service = new MaxBotService(
      prisma as unknown as PrismaService,
      {} as AcademyService,
    );

    await service.handleWebhook({
      update_type: 'message_callback',
      timestamp: 1,
      callback: {
        callback_id: 'roster-1',
        payload: 'mark:lesson:lesson-1',
        user: { user_id: 42 },
      },
    });

    const sent = JSON.parse(String(request.mock.calls[1][1]?.body));
    const buttons = sent.attachments[0].payload.buttons.flat();
    expect(buttons).toHaveLength(29);
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: 'mark:student:lesson-1:student-1' }),
        expect.objectContaining({
          payload: 'mark:student:lesson-1:student-26',
        }),
        expect.objectContaining({ payload: 'mark:bulk:lesson-1:PRESENT' }),
        expect.objectContaining({ payload: 'mark:bulk:lesson-1:ABSENT' }),
      ]),
    );
    expect(sent.text).toContain('Отмечено: 1/26');
  });

  it('marks every unmarked student absent with the selected reason', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_ADMIN_USER_IDS', '42');
    const date = isoDate(todayInNovosibirsk());
    const students = ['one', 'two'].map((id) => ({
      user: { id, lastName: id, firstName: 'Иван' },
    }));
    const editor = {
      id: 'admin-1',
      login: 'admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    };
    const tx = {
      attendance: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 'record-1' }),
      },
      attendanceHistory: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      notification: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      group: { findUnique: vi.fn().mockResolvedValue({ id: 'group-1' }) },
      lesson: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'lesson-1',
          groupId: 'group-1',
          lessonNumber: 3,
          date,
          status: 'PLANNED',
          subject: { name: 'Литература' },
        }),
      },
      groupMember: {
        findMany: vi
          .fn()
          .mockImplementation(
            ({ where }: { where: { user: { role: { in: string[] } } } }) =>
              Promise.resolve(
                where.user.role.in.includes('STUDENT')
                  ? students
                  : [{ user: editor }],
              ),
          ),
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      attendance: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '{}' })),
    );
    const service = new MaxBotService(
      prisma as unknown as PrismaService,
      {} as AcademyService,
    );

    await service.handleWebhook({
      update_type: 'message_callback',
      timestamp: 1,
      callback: {
        callback_id: 'bulk-1',
        payload: 'mark:bulk-run:lesson-1:ABSENT:empty:illness',
        user: { user_id: 42 },
      },
    });

    expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    expect(tx.attendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'ABSENT' }),
      }),
    );
    expect(tx.attendanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: expect.stringContaining('Болезнь'),
        }),
      }),
    );
  });

  it('shows the admin menu only to the configured MAX ID', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_ADMIN_USER_IDS', '42');
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);

    await bot().handleWebhook({
      update_type: 'message_callback',
      timestamp: 1,
      callback: {
        callback_id: 'admin-1',
        payload: 'admin:menu',
        user: { user_id: 42 },
      },
    });

    const sent = JSON.parse(String(request.mock.calls[1][1]?.body));
    expect(sent.text).toContain('Меню администратора');
    expect(sent.attachments[0].payload.buttons.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: 'mark:lessons' }),
      ]),
    );
  });
  it('saves an absence and its selected reason for the linked head', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_HEAD_USER_IDS', '42');
    const date = isoDate(todayInNovosibirsk());
    const student = { id: 'student-1', firstName: 'Иван', lastName: 'Петров' };
    const head = {
      id: 'head-1',
      login: 'is2612-07',
      role: 'HEAD',
      status: 'ACTIVE',
    };
    const tx = {
      attendance: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 'attendance-1' }),
      },
      attendanceHistory: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      notification: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      group: { findUnique: vi.fn().mockResolvedValue({ id: 'group-1' }) },
      lesson: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'lesson-1',
          groupId: 'group-1',
          lessonNumber: 3,
          date,
          status: 'PLANNED',
          subject: { name: 'Литература' },
        }),
      },
      groupMember: {
        findMany: vi
          .fn()
          .mockImplementation(
            ({ where }: { where: { user: { role: { in: string[] } } } }) =>
              Promise.resolve(
                where.user.role.in.includes('STUDENT')
                  ? [{ user: student }]
                  : [{ user: head }],
              ),
          ),
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      attendance: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ studentId: student.id, status: 'ABSENT' }]),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '{}' })),
    );
    const service = new MaxBotService(
      prisma as unknown as PrismaService,
      {} as AcademyService,
    );

    await service.handleWebhook({
      update_type: 'message_callback',
      timestamp: 1,
      callback: {
        callback_id: 'mark-1',
        payload: 'mark:reason:lesson-1:student-1:ABSENT:illness',
        user: { user_id: 42 },
      },
    });

    expect(tx.attendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'ABSENT',
          markedBy: head.id,
        }),
      }),
    );
    expect(tx.attendanceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: expect.stringContaining('Болезнь'),
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ATTENDANCE_MARK_MAX' }),
      }),
    );
  });
  it('shows the MAX user ID without exposing group data', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);

    await bot().handleWebhook({
      update_type: 'message_created',
      timestamp: 1,
      message: { sender: { user_id: 42 }, body: { text: '/id' } },
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain('/messages?user_id=42');
    expect(JSON.parse(String(request.mock.calls[0][1].body)).text).toContain(
      '42',
    );
  });

  it('processes a repeated message only once', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);
    const service = bot();
    const event = {
      update_type: 'message_created',
      timestamp: 1,
      message: {
        sender: { user_id: 42 },
        body: { mid: 'message-1', text: '/id' },
      },
    };

    await Promise.all([
      service.handleWebhook(event),
      service.handleWebhook(event),
    ]);
    await service.handleWebhook(event);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries a message after processing fails', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '{}' });
    vi.stubGlobal('fetch', request);
    const service = bot();
    const event = {
      update_type: 'message_created',
      timestamp: 1,
      message: {
        sender: { user_id: 42 },
        body: { mid: 'message-2', text: '/id' },
      },
    };

    await expect(service.handleWebhook(event)).rejects.toThrow('MAX API 503');
    await service.handleWebhook(event);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('denies head actions to IDs outside the configured allowlist', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_HEAD_USER_IDS', '100');
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);

    await bot().handleWebhook({
      update_type: 'message_callback',
      timestamp: 1,
      callback: {
        callback_id: 'callback-1',
        payload: 'head:group',
        user: { user_id: 42 },
      },
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toContain('/answers?callback_id=');
    expect(request.mock.calls[0][1].body).toBe('{"notification":"Готово"}');
    expect(JSON.parse(String(request.mock.calls[1][1].body)).text).toContain(
      'Недостаточно прав',
    );
  });

  it('publishes announcements only from a private dialog to a negative group chat ID', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_HEAD_USER_IDS', '42');
    vi.stubEnv('MAX_GROUP_CHAT_ID', '-123456');
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);
    const service = bot();

    await service.handleWebhook({
      update_type: 'message_callback',
      timestamp: 1,
      callback: {
        callback_id: 'announce-1',
        payload: 'head:announce',
        user: { user_id: 42 },
      },
    });
    await service.handleWebhook({
      update_type: 'message_created',
      timestamp: 2,
      message: {
        sender: { user_id: 42 },
        recipient: { chat_type: 'chat', chat_id: -123456 },
        body: { mid: 'group-1', text: 'обычное сообщение' },
      },
    });
    expect(
      request.mock.calls.some(([url]) => String(url).includes('chat_id=')),
    ).toBe(false);

    await service.handleWebhook({
      update_type: 'message_created',
      timestamp: 3,
      message: {
        sender: { user_id: 42 },
        recipient: { chat_type: 'dialog', chat_id: -999 },
        body: { mid: 'dialog-1', text: 'Встречаемся в 12:00' },
      },
    });
    expect(
      request.mock.calls.some(([url]) =>
        String(url).includes('chat_id=-123456'),
      ),
    ).toBe(true);
  });
});
