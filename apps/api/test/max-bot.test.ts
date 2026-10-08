import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaxBotService } from '../src/integrations/max/max-bot.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AcademyService } from '../src/integrations/academy/academy.service';

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
    expect(request.mock.calls[0][1].body).toBe('{}');
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
