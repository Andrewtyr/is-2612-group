import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { isoDate, primaryGroup, todayInNovosibirsk } from '../../common/group';
import {
  parseBellSchedule,
  parseChangePdfUrl,
  parseGroupId,
  parseGroupLessons,
  type AcademyBell,
  type AcademyLesson,
} from './academy-parser';
import {
  parsePdfChanges,
  sameOfficialLesson,
  type PdfChange,
} from './academy-pdf';
import type { Prisma } from '@prisma/client';
import { notifyGroup } from '../../common/group-notifications';

const scheduleOrigin = 'https://schedule.altag.ru';
const bellsUrl = 'https://altag.ru/student/schedule/call_schedule';

@Injectable()
export class AcademyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AcademyService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    const interval =
      Math.max(5, Number(process.env.SCHEDULE_SYNC_MINUTES ?? 20)) * 60_000;
    this.timer = setInterval(() => void this.runBackground(), interval);
    setTimeout(() => void this.runBackground(), 5_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runBackground() {
    try {
      await this.sync();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async getText(url: string, options?: RequestInit): Promise<string> {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Источник академии вернул HTTP ${response.status}`);
    return response.text();
  }

  private post(path: string, values: Record<string, string>) {
    return this.getText(`${scheduleOrigin}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
    });
  }

  async status() {
    const group = await primaryGroup(this.prisma);
    return this.prisma.syncState.findUnique({
      where: { id: `academy:${group.id}` },
    });
  }

  async sync() {
    if (this.syncing) return { status: 'already_running' };
    this.syncing = true;
    let stateId = '';
    try {
      const group = await primaryGroup(this.prisma);
      stateId = `academy:${group.id}`;
      await this.prisma.syncState.upsert({
        where: { id: stateId },
        create: { id: stateId, lastAttempt: new Date() },
        update: { lastAttempt: new Date(), lastError: null },
      });
      const [groupHtml, bellsHtml, changesHtml] = await Promise.all([
        this.post('filter_grup.php', { dostup: 'true' }),
        this.getText(bellsUrl),
        this.getText('https://altag.ru/student/schedule/rescheduling-3'),
      ]);
      const groupId = parseGroupId(groupHtml, group.name);
      const bells = parseBellSchedule(bellsHtml);
      if (bells.length < 10)
        throw new Error('Расписание звонков неожиданно короткое');
      await this.saveBells(group.id, bells);
      const start = isoDate(todayInNovosibirsk());
      let count = 0;
      for (let offset = 0; offset < 7; offset++) {
        const date = new Date(start);
        date.setUTCDate(date.getUTCDate() + offset);
        if (date.getUTCDay() === 0) continue;
        const dateText = date.toISOString().slice(0, 10);
        const html = await this.post('ras.php', {
          dostup: 'true',
          gruppa: groupId,
          calendar: dateText,
          ras: 'GRUP',
        });
        const lessons = parseGroupLessons(html, group.name);
        const pdfUrl = parseChangePdfUrl(changesHtml, dateText);
        const pdfChanges = pdfUrl ? await this.loadPdf(pdfUrl, group.name) : [];
        for (const lesson of lessons) {
          await this.saveLesson(
            group.id,
            date,
            lesson,
            bells,
            pdfChanges.some(
              (change) =>
                lesson.subgroup === '' &&
                change.lessonNumber === lesson.lessonNumber,
            ),
          );
          count++;
        }
        for (const change of pdfChanges) {
          await this.savePdfChange(group.id, date, change, bells, pdfUrl!);
        }
      }
      await this.prisma.syncState.update({
        where: { id: stateId },
        data: { lastSuccess: new Date(), lastError: null },
      });
      return { status: 'ok', lessons: count };
    } catch (error) {
      if (stateId) {
        await this.prisma.syncState.update({
          where: { id: stateId },
          data: {
            lastError: error instanceof Error ? error.message : String(error),
          },
        });
      }
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  private async loadPdf(url: string, groupName: string): Promise<PdfChange[]> {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok)
      throw new Error(`PDF изменений вернул HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.includes('application/pdf')) {
      throw new Error('Источник изменений вернул не PDF');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 10_000_000)
      throw new Error('PDF изменений слишком большой');
    return parsePdfChanges(bytes, groupName);
  }

  private async savePdfChange(
    groupId: string,
    date: Date,
    change: PdfChange,
    bells: AcademyBell[],
    url: string,
  ) {
    const key = {
      groupId,
      date,
      lessonNumber: change.lessonNumber,
      subgroup: '',
    };
    const old = await this.prisma.lesson.findUnique({
      where: { groupId_date_lessonNumber_subgroup: key },
      include: { subject: true, teacher: true },
    });
    if (old?.source === 'manual') return;
    if (change.status === 'CANCELLED' && !old) return;
    if (
      old &&
      old.status !== 'CANCELLED' &&
      sameOfficialLesson(
        {
          subject: old.subject?.name ?? '',
          teacher: old.teacher?.name ?? '',
          room: old.room ?? '',
        },
        change,
      )
    )
      return;
    const weekday = date.getUTCDay();
    const scheme = weekday === 1 ? 'MON' : weekday === 6 ? 'SAT' : 'TUE_FRI';
    const bell = bells.find(
      (item) =>
        item.dayScheme === scheme && item.lessonNumber === change.lessonNumber,
    );
    if (!bell) throw new Error(`Неизвестное время ${change.lessonNumber} пары`);
    const before = old
      ? {
          subject: old.subject?.name,
          teacher: old.teacher?.name,
          room: old.room,
          status: old.status,
        }
      : null;
    const after = {
      subject:
        change.status === 'CANCELLED'
          ? (old?.subject?.name ?? '')
          : change.subject,
      teacher:
        change.status === 'CANCELLED'
          ? (old?.teacher?.name ?? '')
          : change.teacher,
      room: change.status === 'CANCELLED' ? (old?.room ?? '') : change.room,
      status:
        change.status === 'CANCELLED' ? 'CANCELLED' : old ? 'CHANGED' : 'ADDED',
    };
    if (before && JSON.stringify(before) === JSON.stringify(after)) return;
    await this.prisma.$transaction(async (tx) => {
      const subject =
        change.status === 'CANCELLED'
          ? null
          : await tx.subject.upsert({
              where: { name: change.subject },
              create: { name: change.subject },
              update: {},
            });
      const teacher =
        change.status === 'CANCELLED' || !change.teacher
          ? null
          : await tx.teacher.upsert({
              where: { name: change.teacher },
              create: { name: change.teacher },
              update: {},
            });
      const saved = await tx.lesson.upsert({
        where: { groupId_date_lessonNumber_subgroup: key },
        create: {
          ...key,
          subjectId: subject?.id,
          teacherId: teacher?.id,
          room: change.room,
          building: '3',
          startTime: bell.startTime,
          endTime: bell.endTime,
          status: 'ADDED',
          source: 'official-pdf',
        },
        update: {
          subjectId: subject?.id ?? undefined,
          teacherId: teacher?.id ?? undefined,
          room: change.status === 'CANCELLED' ? undefined : change.room,
          status: change.status === 'CANCELLED' ? 'CANCELLED' : 'CHANGED',
          source: 'official-pdf',
        },
      });
      await tx.scheduleChange.create({
        data: {
          lessonId: saved.id,
          type:
            change.status === 'CANCELLED'
              ? 'OFFICIAL_CANCEL'
              : old
                ? 'OFFICIAL_UPDATE'
                : 'OFFICIAL_ADD',
          oldValue: before as Prisma.InputJsonValue | undefined,
          newValue: after,
          source: url,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'SCHEDULE_OFFICIAL_CHANGE',
          entityType: 'Lesson',
          entityId: saved.id,
          oldData: before as Prisma.InputJsonValue | undefined,
          newData: after,
        },
      });
      await notifyGroup(
        tx,
        groupId,
        change.status === 'CANCELLED' ? 'Пара отменена' : 'Расписание изменено',
        `${date.toISOString().slice(0, 10)}, ${change.lessonNumber} пара`,
      );
    });
  }

  private async saveBells(groupId: string, bells: AcademyBell[]) {
    for (const bell of bells) {
      await this.prisma.bellSchedule.upsert({
        where: {
          groupId_dayScheme_lessonNumber: {
            groupId,
            dayScheme: bell.dayScheme,
            lessonNumber: bell.lessonNumber,
          },
        },
        create: { groupId, ...bell },
        update: { startTime: bell.startTime, endTime: bell.endTime },
      });
    }
  }

  private async saveLesson(
    groupId: string,
    date: Date,
    lesson: AcademyLesson,
    bells: AcademyBell[],
    hasPdfChange: boolean,
  ) {
    const weekday = date.getUTCDay();
    const scheme = weekday === 1 ? 'MON' : weekday === 6 ? 'SAT' : 'TUE_FRI';
    const bell = bells.find(
      (item) =>
        item.dayScheme === scheme && item.lessonNumber === lesson.lessonNumber,
    );
    if (!bell) throw new Error(`Неизвестное время ${lesson.lessonNumber} пары`);
    const key = {
      groupId,
      date,
      lessonNumber: lesson.lessonNumber,
      subgroup: lesson.subgroup,
    };
    const old = await this.prisma.lesson.findUnique({
      where: { groupId_date_lessonNumber_subgroup: key },
      include: { subject: true, teacher: true },
    });
    if (old?.source === 'manual') return;
    if (old?.source === 'official-pdf' && hasPdfChange) return;
    const oldSnapshot = old
      ? {
          subject: old.subject?.name,
          teacher: old.teacher?.name,
          room: old.room,
          building: old.building,
          startTime: old.startTime,
          endTime: old.endTime,
        }
      : null;
    const nextSnapshot = {
      subject: lesson.subject,
      teacher: lesson.teacher,
      room: lesson.room,
      building: lesson.building,
      startTime: bell.startTime,
      endTime: bell.endTime,
    };
    if (
      oldSnapshot &&
      old?.source !== 'official-pdf' &&
      JSON.stringify(oldSnapshot) === JSON.stringify(nextSnapshot)
    )
      return;
    await this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.upsert({
        where: { name: lesson.subject },
        create: { name: lesson.subject },
        update: {},
      });
      const teacher = lesson.teacher
        ? await tx.teacher.upsert({
            where: { name: lesson.teacher },
            create: { name: lesson.teacher },
            update: {},
          })
        : null;
      const saved = await tx.lesson.upsert({
        where: { groupId_date_lessonNumber_subgroup: key },
        create: {
          ...key,
          subjectId: subject.id,
          teacherId: teacher?.id,
          room: lesson.room,
          building: lesson.building,
          startTime: bell.startTime,
          endTime: bell.endTime,
          status: 'PLANNED',
          source: 'academy',
        },
        update: {
          subjectId: subject.id,
          teacherId: teacher?.id,
          room: lesson.room,
          building: lesson.building,
          startTime: bell.startTime,
          endTime: bell.endTime,
          status: 'CHANGED',
          source: 'academy',
        },
      });
      if (oldSnapshot) {
        await tx.scheduleChange.create({
          data: {
            lessonId: saved.id,
            type: 'OFFICIAL_UPDATE',
            oldValue: oldSnapshot as Prisma.InputJsonValue,
            newValue: nextSnapshot as Prisma.InputJsonValue,
            source: scheduleOrigin,
          },
        });
        await notifyGroup(
          tx,
          groupId,
          'Расписание изменено',
          `${date.toISOString().slice(0, 10)}, ${lesson.lessonNumber} пара`,
        );
      }
    });
  }
}
