import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { parseInput } from '../../common/input';
import { isoDate, primaryGroup, todayInNovosibirsk } from '../../common/group';
import type { AuthRequest } from '../../common/auth.guard';
import { z } from 'zod';
import type { Lesson, Prisma } from '@prisma/client';
import { AcademyService } from '../../integrations/academy/academy.service';
import { notifyGroup } from '../../common/group-notifications';

const lessonSchema = z.object({
  date: z.iso.date(),
  lessonNumber: z.number().int().min(1).max(12),
  subject: z.string().min(1),
  teacher: z.string().optional(),
  room: z.string().optional(),
  building: z.string().optional(),
  subgroup: z.string().default(''),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  status: z
    .enum(['PLANNED', 'CHANGED', 'CANCELLED', 'ADDED'])
    .default('PLANNED'),
  reason: z.string().min(1),
});

const lessonInclude = {
  subject: true,
  teacher: true,
} satisfies Prisma.LessonInclude;
function snapshot(lesson: Lesson) {
  return {
    date: lesson.date.toISOString().slice(0, 10),
    lessonNumber: lesson.lessonNumber,
    subjectId: lesson.subjectId,
    teacherId: lesson.teacherId,
    room: lesson.room,
    building: lesson.building,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    subgroup: lesson.subgroup,
    status: lesson.status,
    source: lesson.source,
  };
}

@Controller('schedule')
export class ScheduleController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademyService) private readonly academy: AcademyService,
  ) {}

  @Get('sync/status')
  syncStatus() {
    return this.academy.status();
  }

  @Roles('CURATOR', 'ADMIN')
  @Post('sync')
  sync() {
    return this.academy.sync();
  }

  @Get('bells')
  async bells() {
    const group = await primaryGroup(this.prisma);
    return this.prisma.bellSchedule.findMany({
      where: { groupId: group.id },
      orderBy: [{ dayScheme: 'asc' }, { lessonNumber: 'asc' }],
    });
  }

  private async list(from: Date, to: Date) {
    const group = await primaryGroup(this.prisma);
    return this.prisma.lesson.findMany({
      where: { groupId: group.id, date: { gte: from, lt: to } },
      include: lessonInclude,
      orderBy: [{ date: 'asc' }, { lessonNumber: 'asc' }, { subgroup: 'asc' }],
    });
  }

  @Get('today')
  today() {
    return this.byDate(todayInNovosibirsk());
  }

  @Get('tomorrow')
  tomorrow() {
    const date = isoDate(todayInNovosibirsk());
    date.setUTCDate(date.getUTCDate() + 1);
    return this.byDate(date.toISOString().slice(0, 10));
  }

  @Get('week')
  week() {
    const from = isoDate(todayInNovosibirsk());
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    return this.list(from, to);
  }

  @Get('date/:date')
  byDate(@Param('date') date: string) {
    const from = isoDate(date);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    return this.list(from, to);
  }

  @Get('changes')
  async changes() {
    const group = await primaryGroup(this.prisma);
    return this.prisma.scheduleChange.findMany({
      where: { lesson: { groupId: group.id } },
      orderBy: { detectedAt: 'desc' },
      take: 100,
      include: { lesson: { include: lessonInclude } },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Post('lessons')
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parseInput(lessonSchema, body);
    const group = await primaryGroup(this.prisma);
    const lesson = await this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.upsert({
        where: { name: input.subject },
        create: { name: input.subject },
        update: {},
      });
      const teacher = input.teacher
        ? await tx.teacher.upsert({
            where: { name: input.teacher },
            create: { name: input.teacher },
            update: {},
          })
        : null;
      const created = await tx.lesson.create({
        data: {
          groupId: group.id,
          date: isoDate(input.date),
          lessonNumber: input.lessonNumber,
          subjectId: subject.id,
          teacherId: teacher?.id,
          room: input.room,
          building: input.building,
          subgroup: input.subgroup,
          startTime: input.startTime,
          endTime: input.endTime,
          status: input.status,
          source: 'manual',
        },
      });
      await tx.scheduleChange.create({
        data: {
          lessonId: created.id,
          type: 'CREATED',
          newValue: input,
          source: 'manual',
          reason: input.reason,
          changedBy: request.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'LESSON_CREATE',
          entityType: 'Lesson',
          entityId: created.id,
          newData: input,
        },
      });
      await notifyGroup(
        tx,
        group.id,
        'Добавлена пара',
        `${input.date}, ${input.lessonNumber} пара`,
      );
      return created;
    });
    return lesson;
  }

  @Roles('CURATOR', 'ADMIN')
  @Patch('lessons/:id')
  async update(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(
      lessonSchema.partial().extend({ reason: z.string().min(1) }),
      body,
    );
    const group = await primaryGroup(this.prisma);
    const old = await this.prisma.lesson.findFirst({
      where: { id, groupId: group.id },
    });
    if (!old) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const subject = input.subject
        ? await tx.subject.upsert({
            where: { name: input.subject },
            create: { name: input.subject },
            update: {},
          })
        : null;
      const teacher = input.teacher
        ? await tx.teacher.upsert({
            where: { name: input.teacher },
            create: { name: input.teacher },
            update: {},
          })
        : null;
      const updated = await tx.lesson.update({
        where: { id },
        data: {
          date: input.date ? isoDate(input.date) : undefined,
          lessonNumber: input.lessonNumber,
          subjectId: subject?.id,
          teacherId: teacher?.id,
          room: input.room,
          building: input.building,
          subgroup: input.subgroup,
          startTime: input.startTime,
          endTime: input.endTime,
          status: input.status ?? 'CHANGED',
          source: 'manual',
        },
      });
      await tx.scheduleChange.create({
        data: {
          lessonId: id,
          type: 'MANUAL_UPDATE',
          oldValue: snapshot(old),
          newValue: snapshot(updated),
          source: 'manual',
          reason: input.reason,
          changedBy: request.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'LESSON_UPDATE',
          entityType: 'Lesson',
          entityId: id,
          oldData: snapshot(old),
          newData: snapshot(updated),
        },
      });
      await notifyGroup(
        tx,
        group.id,
        input.status === 'CANCELLED' ? 'Пара отменена' : 'Расписание изменено',
        `${input.date ?? old.date.toISOString().slice(0, 10)}, ${input.lessonNumber ?? old.lessonNumber} пара`,
      );
      return updated;
    });
  }
}
