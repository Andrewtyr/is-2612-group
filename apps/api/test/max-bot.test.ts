import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaxBotService } from '../src/integrations/max/max-bot.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AcademyService } from '../src/integrations/academy/academy.service';

function bot(prisma = {} as PrismaService) {
  return new MaxBotService(prisma, {} as AcademyService);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('MAX schedule bot', () => {
  it('accepts only the configured webhook secret', () => {
    vi.stubEnv('MAX_BOT_MODE', 'webhook');
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_WEBHOOK_URL', 'https://is2612.ru/api/max/webhook');
    vi.stubEnv('MAX_WEBHOOK_SECRET', 'secret_for_tests');
    expect(bot().verifyWebhookSecret('secret_for_tests')).toBe(true);
    expect(bot().verifyWebhookSecret('wrong')).toBe(false);
  });

  it('shows schedule links without attendance controls', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_ADMIN_USER_IDS', '42');
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);
    await bot().handleWebhook({
      update_type: 'message_created',
      timestamp: 1,
      message: { sender: { user_id: 42 }, body: { text: '/start' } },
    });
    const sent = JSON.parse(String(request.mock.calls[0][1].body));
    const buttons = sent.attachments[0].payload.buttons.flat();
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: 'schedule:today' }),
        expect.objectContaining({ payload: 'schedule:tomorrow' }),
        expect.objectContaining({ payload: 'changes' }),
        expect.objectContaining({ payload: 'bells' }),
      ]),
    );
    expect(
      buttons.some(
        (button: { payload?: string }) =>
          button.payload?.startsWith('mark:') ||
          button.payload === 'admin:menu',
      ),
    ).toBe(false);
  });

  it('ignores old marking callbacks and returns to the schedule menu', async () => {
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
        callback_id: 'old-mark',
        payload: 'mark:lessons',
        user: { user_id: 42 },
      },
    });
    const sent = JSON.parse(String(request.mock.calls[1][1].body));
    expect(sent.text).toContain('расписание группы');
  });

  it('sends a schedule change once per destination', async () => {
    vi.stubEnv('MAX_BOT_TOKEN', 'test-token');
    vi.stubEnv('MAX_ADMIN_USER_IDS', '42');
    vi.stubEnv('MAX_HEAD_USER_IDS', '');
    vi.stubEnv('MAX_GROUP_CHAT_ID', '');
    const detectedAt = new Date('2026-10-09T05:00:00Z');
    const state = { lastSuccess: new Date('2026-10-09T04:00:00Z') };
    const prisma = {
      group: { findUnique: vi.fn().mockResolvedValue({ id: 'group-1' }) },
      syncState: {
        findUnique: vi.fn().mockResolvedValue(state),
        update: vi
          .fn()
          .mockImplementation(
            async ({ data }: { data: { lastSuccess?: Date } }) => {
              if (data.lastSuccess) state.lastSuccess = data.lastSuccess;
              return state;
            },
          ),
      },
      scheduleChange: {
        findMany: vi
          .fn()
          .mockImplementation(
            ({ where }: { where: { detectedAt: { gt: Date } } }) =>
              Promise.resolve(
                where.detectedAt.gt < detectedAt
                  ? [
                      {
                        id: 'change-1',
                        detectedAt,
                        type: 'OFFICIAL_UPDATE',
                        oldValue: { subject: 'Математика' },
                        lesson: {
                          date: new Date('2026-10-09'),
                          lessonNumber: 2,
                          subject: { name: 'Физика' },
                          room: '201',
                          status: 'CHANGED',
                        },
                      },
                    ]
                  : [],
              ),
          ),
      },
    };
    const request = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return { ok: true, text: async () => '{}' };
    });
    vi.stubGlobal('fetch', request);
    const service = bot(prisma as unknown as PrismaService);
    const alerts = service as unknown as {
      sendScheduleAlerts: () => Promise<void>;
    };
    await alerts.sendScheduleAlerts();
    await alerts.sendScheduleAlerts();
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0][1].body)).text).toContain(
      'Было: Математика',
    );
  });
});
