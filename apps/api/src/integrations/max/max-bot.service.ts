import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AcademyService } from '../academy/academy.service';
import { isoDate, primaryGroup, todayInNovosibirsk } from '../../common/group';

type MaxUser = {
  user_id: number;
  name?: string;
  username?: string;
};

type MaxMessage = {
  sender?: MaxUser;
  recipient?: {
    chat_id?: number | null;
    user_id?: number | null;
    chat_type?: string;
  };
  body?: {
    mid?: string;
    text?: string | null;
  } | null;
};

type MaxUpdate = {
  update_type: string;
  timestamp: number;
  chat_id?: number;
  user?: MaxUser;
  message?: MaxMessage | null;
  callback?: {
    timestamp: number;
    callback_id: string;
    payload?: string;
    user: MaxUser;
  };
};

type UpdatesResponse = {
  updates: MaxUpdate[];
  marker: number | null;
};

type KeyboardButton =
  | { type: 'callback'; text: string; payload: string }
  | { type: 'link'; text: string; url: string };

type Attachment = {
  type: 'inline_keyboard';
  payload: { buttons: KeyboardButton[][] };
};

@Injectable()
export class MaxBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaxBotService.name);
  private readonly apiBase = 'https://platform-api2.max.ru';
  private readonly pendingAnnouncement = new Set<number>();
  private readonly processedUpdates = new Map<string, Promise<unknown>>();
  private readonly sendQueues = new Map<string, Promise<unknown>>();
  private stopping = false;
  private marker: number | null | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademyService) private readonly academy: AcademyService,
  ) {}

  onModuleInit() {
    if (!this.token) {
      this.logger.warn('MAX_BOT_TOKEN не задан — MAX-бот отключён');
      return;
    }

    const mode = this.mode;
    if (mode === 'polling') {
      this.logger.log('MAX-бот запускается в режиме Long Polling');
      void this.pollLoop();
    } else if (mode === 'webhook') {
      if (!this.webhookSettings()) {
        this.logger.error(
          'MAX webhook отключён: задайте HTTPS MAX_WEBHOOK_URL и MAX_WEBHOOK_SECRET (5–256 символов A-Z, 0-9, _ или -)',
        );
        return;
      }
      this.logger.log('MAX-бот работает в режиме Webhook');
      void this.webhookLoop();
    } else {
      this.logger.warn(`Неизвестный MAX_BOT_MODE=${mode}; бот отключён`);
    }
  }

  onModuleDestroy() {
    this.stopping = true;
  }

  private get token() {
    return process.env.MAX_BOT_TOKEN?.trim() ?? '';
  }

  private get mode() {
    return (process.env.MAX_BOT_MODE ?? 'webhook').trim().toLowerCase();
  }

  private get siteUrl() {
    return (process.env.MAX_SITE_URL ?? 'https://is2612.ru').trim();
  }

  private headIds() {
    return new Set(
      (process.env.MAX_HEAD_USER_IDS ?? '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    );
  }

  private isHead(userId: number) {
    return this.headIds().has(userId);
  }

  private groupChatId() {
    const value = Number(process.env.MAX_GROUP_CHAT_ID ?? '');
    return Number.isSafeInteger(value) && value !== 0 ? value : null;
  }

  verifyWebhookSecret(value: string | undefined) {
    if (!this.token || this.mode !== 'webhook' || !value) return false;
    const settings = this.webhookSettings();
    if (!settings) return false;
    const actual = Buffer.from(value);
    const expected = Buffer.from(settings.secret);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private webhookSettings() {
    const url = process.env.MAX_WEBHOOK_URL?.trim() ?? '';
    const secret = process.env.MAX_WEBHOOK_SECRET?.trim() ?? '';
    if (!/^[A-Za-z0-9_-]{5,256}$/.test(secret)) return null;
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.port ||
        parsed.username ||
        parsed.password ||
        parsed.hash
      ) {
        return null;
      }
    } catch {
      return null;
    }
    return { url, secret };
  }

  handleWebhook(update: unknown) {
    const event = update as MaxUpdate;
    const key =
      event?.update_type === 'message_created' && event.message?.body?.mid
        ? `message:${event.message.body.mid}`
        : event?.update_type === 'message_callback' &&
            event.callback?.callback_id
          ? `callback:${event.callback.callback_id}`
          : null;
    if (!key) return this.processUpdate(event);

    const existing = this.processedUpdates.get(key);
    if (existing) return existing;
    const processing = this.processUpdate(event).catch((error) => {
      this.processedUpdates.delete(key);
      throw error;
    });
    this.processedUpdates.set(key, processing);
    void processing.then(
      () =>
        setTimeout(
          () => this.processedUpdates.delete(key),
          10 * 60_000,
        ).unref(),
      () => undefined,
    );
    return processing;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) throw new Error('MAX_BOT_TOKEN не задан');
    const headers = new Headers(init.headers);
    headers.set('Authorization', this.token);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(
        path.startsWith('/updates?') ? 35_000 : 10_000,
      ),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MAX API ${response.status}: ${text.slice(0, 500)}`);
    }
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async pollLoop() {
    while (!this.stopping) {
      try {
        const query = new URLSearchParams({
          limit: '100',
          timeout: '30',
          types: 'message_created,message_callback,bot_started',
        });
        if (this.marker != null) query.set('marker', String(this.marker));
        const result = await this.request<UpdatesResponse>(
          `/updates?${query.toString()}`,
        );
        for (const update of result.updates ?? []) {
          await this.processUpdate(update);
        }
        this.marker = result.marker;
      } catch (error) {
        if (this.stopping) return;
        this.logError(error);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  }

  private async ensureWebhook() {
    const settings = this.webhookSettings();
    if (!settings) throw new Error('Настройки MAX webhook неполные');
    const body: Record<string, unknown> = {
      url: settings.url,
      update_types: ['message_created', 'message_callback', 'bot_started'],
      secret: settings.secret,
    };
    const result = await this.request<{ success?: boolean; message?: string }>(
      '/subscriptions',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (result.success === false) {
      throw new Error(result.message || 'MAX не создал webhook-подписку');
    }
    this.logger.log(`Webhook MAX настроен: ${settings.url}`);
  }

  private async webhookLoop() {
    while (!this.stopping) {
      try {
        await this.ensureWebhook();
        return;
      } catch (error) {
        this.logError(error);
        this.logger.warn('Повторная регистрация MAX webhook через 60 секунд');
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      }
    }
  }

  private async processUpdate(update: MaxUpdate) {
    if (!update || typeof update.update_type !== 'string') return;

    if (update.update_type === 'bot_started') {
      const userId = update.user?.user_id;
      if (userId) await this.sendMenu(userId);
      return;
    }

    if (update.update_type === 'message_callback') {
      const userId = update.callback?.user.user_id;
      const callbackId = update.callback?.callback_id;
      const payload = update.callback?.payload ?? '';
      if (!userId || !callbackId) return;
      await this.answerCallback(callbackId);
      await this.handleAction(userId, payload);
      return;
    }

    if (update.update_type === 'message_created') {
      const message = update.message;
      const userId = message?.sender?.user_id;
      if (!userId) return;
      const text = (message?.body?.text ?? '').trim();

      if (
        this.pendingAnnouncement.has(userId) &&
        text &&
        !text.startsWith('/') &&
        message?.recipient?.chat_type === 'dialog'
      ) {
        await this.publishAnnouncement(userId, text);
        return;
      }

      const normalized = text.toLocaleLowerCase('ru-RU');
      if (!text || normalized === '/start' || normalized === 'меню') {
        await this.sendMenu(userId);
        return;
      }
      if (normalized === '/id' || normalized === 'мой id') {
        await this.sendToUser(userId, `Ваш MAX user_id: ${userId}`);
        return;
      }
      if (normalized === '/chatid' || normalized === 'id чата') {
        const chatId = message?.recipient?.chat_id;
        await this.sendToUser(
          userId,
          chatId
            ? `chat_id этого диалога/чата: ${chatId}`
            : 'MAX не передал chat_id в этом сообщении.',
        );
        return;
      }
      if (normalized === '/cancel' || normalized === 'отмена') {
        this.pendingAnnouncement.delete(userId);
        await this.sendToUser(userId, 'Действие отменено.');
        return;
      }
      if (normalized.includes('сегодня')) {
        await this.sendSchedule(userId, todayInNovosibirsk());
        return;
      }
      if (normalized.includes('завтра')) {
        await this.sendSchedule(userId, this.tomorrow());
        return;
      }
      if (normalized.includes('замен') || normalized.includes('изменен')) {
        await this.sendChanges(userId);
        return;
      }
      if (normalized.includes('звон')) {
        await this.sendBells(userId);
        return;
      }
      if (normalized.includes('старост')) {
        await this.sendHeadMenu(userId);
        return;
      }

      await this.sendToUser(
        userId,
        'Не понял сообщение. Используйте кнопки меню или команду /start.',
        this.mainKeyboard(userId),
      );
    }
  }

  private async handleAction(userId: number, payload: string) {
    switch (payload) {
      case 'menu':
        return this.sendMenu(userId);
      case 'schedule:today':
        return this.sendSchedule(userId, todayInNovosibirsk());
      case 'schedule:tomorrow':
        return this.sendSchedule(userId, this.tomorrow());
      case 'changes':
        return this.sendChanges(userId);
      case 'bells':
        return this.sendBells(userId);
      case 'head:menu':
        return this.sendHeadMenu(userId);
      case 'head:group':
        return this.sendGroupList(userId);
      case 'head:attendance':
        return this.sendAttendanceSummary(userId);
      case 'head:sync':
        return this.syncSchedule(userId);
      case 'head:announce':
        return this.beginAnnouncement(userId);
      default:
        return this.sendMenu(userId);
    }
  }

  private tomorrow() {
    const date = isoDate(todayInNovosibirsk());
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  private mainKeyboard(userId: number): Attachment[] {
    const buttons: KeyboardButton[][] = [
      [
        { type: 'callback', text: '📅 Сегодня', payload: 'schedule:today' },
        { type: 'callback', text: '📆 Завтра', payload: 'schedule:tomorrow' },
      ],
      [
        { type: 'callback', text: '🔄 Замены', payload: 'changes' },
        { type: 'callback', text: '🔔 Звонки', payload: 'bells' },
      ],
      [{ type: 'link', text: '🌐 Сайт группы', url: this.siteUrl }],
    ];
    if (this.isHead(userId)) {
      buttons.push([
        { type: 'callback', text: '⚙️ Староста', payload: 'head:menu' },
      ]);
    }
    return [{ type: 'inline_keyboard', payload: { buttons } }];
  }

  private headKeyboard(): Attachment[] {
    return [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [
              { type: 'callback', text: '👥 Группа', payload: 'head:group' },
              {
                type: 'callback',
                text: '📊 Посещаемость',
                payload: 'head:attendance',
              },
            ],
            [
              {
                type: 'callback',
                text: '🔄 Синхронизировать',
                payload: 'head:sync',
              },
            ],
            [
              {
                type: 'callback',
                text: '📣 Объявление',
                payload: 'head:announce',
              },
            ],
            [{ type: 'callback', text: '⬅️ Главное меню', payload: 'menu' }],
          ],
        },
      },
    ];
  }

  private async sendMenu(userId: number) {
    const extra = this.isHead(userId)
      ? '\n\nДля вас доступен раздел «Староста».'
      : '';
    return this.sendToUser(
      userId,
      `ИС-2612 — помощник группы.\nРасписание, замены, звонки и важная информация.${extra}`,
      this.mainKeyboard(userId),
    );
  }

  private async sendHeadMenu(userId: number) {
    if (!this.isHead(userId)) {
      return this.sendToUser(
        userId,
        'Раздел доступен только старосте/заместителю.',
      );
    }
    return this.sendToUser(
      userId,
      '⚙️ Меню старосты\n\nМожно посмотреть группу и посещаемость, обновить расписание или отправить объявление в групповой чат.',
      this.headKeyboard(),
    );
  }

  private async sendSchedule(userId: number, dateText: string) {
    const group = await primaryGroup(this.prisma);
    const from = isoDate(dateText);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    const lessons = await this.prisma.lesson.findMany({
      where: { groupId: group.id, date: { gte: from, lt: to } },
      include: { subject: true, teacher: true },
      orderBy: [{ lessonNumber: 'asc' }, { subgroup: 'asc' }],
    });

    const label = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      timeZone: 'UTC',
    }).format(from);

    if (!lessons.length) {
      return this.sendToUser(
        userId,
        `📅 ${label}\n\nЗанятий в базе нет.`,
        this.mainKeyboard(userId),
      );
    }

    const lines = lessons.map((lesson) => {
      const status =
        lesson.status === 'CANCELLED'
          ? ' ❌ отменена'
          : lesson.status === 'CHANGED'
            ? ' ⚠️ изменена'
            : lesson.status === 'ADDED'
              ? ' ➕ добавлена'
              : '';
      const room = lesson.room ? `, каб. ${lesson.room}` : '';
      const teacher = lesson.teacher?.name ? `\n   ${lesson.teacher.name}` : '';
      const subgroup = lesson.subgroup ? ` [${lesson.subgroup}]` : '';
      return `${lesson.lessonNumber}. ${lesson.startTime}–${lesson.endTime} — ${lesson.subject?.name ?? 'Без названия'}${subgroup}${room}${status}${teacher}`;
    });

    return this.sendToUser(
      userId,
      `📅 ${label}\n\n${lines.join('\n\n')}`,
      this.mainKeyboard(userId),
    );
  }

  private async sendChanges(userId: number) {
    const group = await primaryGroup(this.prisma);
    const changes = await this.prisma.scheduleChange.findMany({
      where: { lesson: { groupId: group.id } },
      include: { lesson: { include: { subject: true } } },
      orderBy: { detectedAt: 'desc' },
      take: 10,
    });

    if (!changes.length) {
      return this.sendToUser(
        userId,
        '🔄 Изменений расписания пока нет.',
        this.mainKeyboard(userId),
      );
    }

    const lines = changes.map((change) => {
      const date = change.lesson.date.toISOString().slice(0, 10);
      const subject = change.lesson.subject?.name ?? 'Без названия';
      const reason = change.reason ? ` — ${change.reason}` : '';
      return `• ${date}, ${change.lesson.lessonNumber} пара: ${subject} (${change.type})${reason}`;
    });

    return this.sendToUser(
      userId,
      `🔄 Последние изменения\n\n${lines.join('\n')}`,
      this.mainKeyboard(userId),
    );
  }

  private async sendBells(userId: number) {
    const group = await primaryGroup(this.prisma);
    const date = isoDate(todayInNovosibirsk());
    const day = date.getUTCDay();
    const scheme = day === 1 ? 'MON' : day === 6 ? 'SAT' : 'TUE_FRI';
    const bells = await this.prisma.bellSchedule.findMany({
      where: { groupId: group.id, dayScheme: scheme },
      orderBy: { lessonNumber: 'asc' },
    });
    if (!bells.length) {
      return this.sendToUser(userId, '🔔 Расписание звонков ещё не загружено.');
    }
    const lines = bells.map(
      (bell) => `${bell.lessonNumber}. ${bell.startTime}–${bell.endTime}`,
    );
    return this.sendToUser(
      userId,
      `🔔 Звонки (${scheme})\n\n${lines.join('\n')}`,
      this.mainKeyboard(userId),
    );
  }

  private async sendGroupList(userId: number) {
    if (!this.isHead(userId)) return this.denied(userId);
    const group = await primaryGroup(this.prisma);
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId: group.id,
        user: {
          role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] },
          status: 'ACTIVE',
        },
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, role: true, status: true },
        },
      },
      orderBy: { user: { lastName: 'asc' } },
    });
    const lines = members.map(
      ({ user }, index) =>
        `${index + 1}. ${user.lastName} ${user.firstName} — ${user.role}${user.status === 'BLOCKED' ? ' (заблокирован)' : ''}`,
    );
    return this.sendToUser(
      userId,
      `👥 ${group.name}\n\n${lines.join('\n') || 'Список пуст.'}`,
      this.headKeyboard(),
    );
  }

  private async sendAttendanceSummary(userId: number) {
    if (!this.isHead(userId)) return this.denied(userId);
    const group = await primaryGroup(this.prisma);
    const dateText = todayInNovosibirsk();
    const from = isoDate(dateText);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    const totalStudents = await this.prisma.groupMember.count({
      where: {
        groupId: group.id,
        user: {
          role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] },
          status: 'ACTIVE',
        },
      },
    });
    const lessons = await this.prisma.lesson.findMany({
      where: { groupId: group.id, date: { gte: from, lt: to } },
      include: {
        subject: true,
        attendances: {
          where: {
            student: {
              role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] },
              status: 'ACTIVE',
            },
          },
        },
      },
      orderBy: { lessonNumber: 'asc' },
    });
    if (!lessons.length) {
      return this.sendToUser(
        userId,
        '📊 Сегодня занятий нет.',
        this.headKeyboard(),
      );
    }
    const lines = lessons.map((lesson) => {
      const present = lesson.attendances.filter(
        (x) => x.status === 'PRESENT',
      ).length;
      const absent = lesson.attendances.filter(
        (x) => x.status === 'ABSENT',
      ).length;
      const late = lesson.attendances.filter((x) => x.status === 'LATE').length;
      const marked = lesson.attendances.length;
      return `${lesson.lessonNumber}. ${lesson.subject?.name ?? 'Без названия'} — отмечено ${marked}/${totalStudents}, ✅ ${present}, ❌ ${absent}, ⏰ ${late}`;
    });
    return this.sendToUser(
      userId,
      `📊 Посещаемость на ${dateText}\n\n${lines.join('\n')}`,
      this.headKeyboard(),
    );
  }

  private async syncSchedule(userId: number) {
    if (!this.isHead(userId)) return this.denied(userId);
    await this.sendToUser(userId, '🔄 Запускаю синхронизацию расписания…');
    void this.academy
      .sync()
      .then((result) =>
        this.sendToUser(
          userId,
          `✅ Синхронизация завершена: ${JSON.stringify(result)}`,
          this.headKeyboard(),
        ),
      )
      .catch(async (error) => {
        this.logError(error);
        await this.sendToUser(
          userId,
          'Не удалось обновить расписание. Попробуйте позже.',
        );
      })
      .catch((error) => this.logError(error));
  }

  private async beginAnnouncement(userId: number) {
    if (!this.isHead(userId)) return this.denied(userId);
    if (!this.groupChatId()) {
      return this.sendToUser(
        userId,
        'Сначала задайте MAX_GROUP_CHAT_ID в .env.production. Добавьте бота в групповой чат, напишите там /chatid и сохраните полученный ID.',
        this.headKeyboard(),
      );
    }
    this.pendingAnnouncement.add(userId);
    return this.sendToUser(
      userId,
      '📣 Отправьте следующим сообщением текст объявления.\nДля отмены: /cancel',
    );
  }

  private async publishAnnouncement(userId: number, text: string) {
    if (!this.isHead(userId)) return this.denied(userId);
    const chatId = this.groupChatId();
    if (!chatId) return this.beginAnnouncement(userId);
    await this.sendToChat(chatId, `📣 Объявление старосты\n\n${text}`);
    this.pendingAnnouncement.delete(userId);
    return this.sendToUser(
      userId,
      '✅ Объявление отправлено в групповой чат.',
      this.headKeyboard(),
    );
  }

  private denied(userId: number) {
    return this.sendToUser(userId, 'Недостаточно прав для этого действия.');
  }

  private async answerCallback(callbackId: string) {
    try {
      await this.request(
        `/answers?callback_id=${encodeURIComponent(callbackId)}`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
    } catch (error) {
      this.logError(error);
    }
  }

  private sendToUser(userId: number, text: string, attachments?: Attachment[]) {
    return this.sendMessage(
      `user_id=${encodeURIComponent(String(userId))}`,
      text,
      attachments,
    );
  }

  private sendToChat(chatId: number, text: string, attachments?: Attachment[]) {
    return this.sendMessage(
      `chat_id=${encodeURIComponent(String(chatId))}`,
      text,
      attachments,
    );
  }

  private sendMessage(query: string, text: string, attachments?: Attachment[]) {
    const clipped = text.length > 3900 ? `${text.slice(0, 3890)}\n…` : text;
    const path = `/messages?${query}`;
    const init = {
      method: 'POST',
      body: JSON.stringify({
        text: clipped,
        attachments: attachments ?? undefined,
        format: 'markdown',
      }),
    };
    const previous = this.sendQueues.get(query) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        let result: unknown;
        try {
          result = await this.request(path, init);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.startsWith('MAX API 429:')
          ) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          result = await this.request(path, init);
        }
        await new Promise((resolve) => setTimeout(resolve, 550));
        return result;
      });
    this.sendQueues.set(query, queued);
    void queued
      .finally(() => {
        if (this.sendQueues.get(query) === queued)
          this.sendQueues.delete(query);
      })
      .catch(() => undefined);
    return queued;
  }

  private logError(error: unknown) {
    this.logger.error(error instanceof Error ? error.message : String(error));
  }
}
