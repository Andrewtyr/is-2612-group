import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { parseInput } from '../../common/input';
import { isoDate, primaryGroup, todayInNovosibirsk } from '../../common/group';
import { canEditAttendance } from './attendance-policy';
import { buildWeeklyReport, weekMonday } from './weekly-report';
import type { AuthRequest } from '../../common/auth.guard';
import { z } from 'zod';

const entriesSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string(),
        status: z.enum([
          'PRESENT',
          'ABSENT',
          'LATE',
          'LEFT_EARLY',
          'EXCUSED',
          'EXEMPT',
          'NEEDS_REVIEW',
        ]),
      }),
    )
    .min(1),
  reason: z.string().optional(),
});

@Controller()
export class AttendanceController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Roles('HEAD', 'ADMIN')
  @Get('attendance/reports/weekly')
  async weeklyReport(@Query('week') week?: string) {
    const requested = week ?? todayInNovosibirsk();
    isoDate(requested);
    const monday = weekMonday(requested);
    const from = isoDate(monday);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    const group = await primaryGroup(this.prisma);
    const [members, lessons] = await Promise.all([
      this.prisma.groupMember.findMany({
        where: {
          groupId: group.id,
          user: {
            role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] },
            status: 'ACTIVE',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
        },
        orderBy: { user: { lastName: 'asc' } },
      }),
      this.prisma.lesson.findMany({
        where: { groupId: group.id, date: { gte: from, lt: to } },
        select: { id: true, date: true, status: true },
      }),
    ]);
    const marks = await this.prisma.attendance.findMany({
      where: { lessonId: { in: lessons.map((lesson) => lesson.id) } },
      select: { lessonId: true, studentId: true, status: true },
    });
    return buildWeeklyReport(
      monday,
      members.map(({ user }) => user),
      lessons,
      marks,
    );
  }

  @Roles('HEAD', 'DEPUTY', 'CURATOR', 'ADMIN')
  @Get('lessons/:id/attendance')
  async lessonAttendance(@Param('id') id: string) {
    const group = await primaryGroup(this.prisma);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, groupId: group.id },
    });
    if (!lesson) throw new NotFoundException();
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId: group.id,
        user: { role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] } },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { user: { lastName: 'asc' } },
    });
    const attendance = await this.prisma.attendance.findMany({
      where: { lessonId: id },
    });
    const notices = await this.prisma.absenceReason.findMany({
      where: {
        date: lesson.date,
        studentId: { in: members.map(({ user }) => user.id) },
        OR: [{ lessonId: null }, { lessonId: id }],
      },
      select: { studentId: true },
    });
    const noticeIds = new Set(notices.map((notice) => notice.studentId));
    return members.map(({ user }) => ({
      student: user,
      attendance: attendance.find((item) => item.studentId === user.id) ?? null,
      preAbsent: noticeIds.has(user.id),
    }));
  }

  @Roles('HEAD', 'DEPUTY', 'CURATOR', 'ADMIN')
  @Post('lessons/:id/attendance')
  async mark(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(entriesSchema, body);
    const group = await primaryGroup(this.prisma);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, groupId: group.id },
    });
    if (!lesson) throw new NotFoundException();
    if (lesson.status === 'CANCELLED')
      throw new BadRequestException('Отменённую пару нельзя отметить');
    const date = lesson.date.toISOString().slice(0, 10);
    if (
      !canEditAttendance(
        request.user.role,
        date,
        new Date(),
        Number(process.env.ATTENDANCE_EDIT_WINDOW_DAYS ?? 0),
      )
    ) {
      throw new ForbiddenException('Время редактирования истекло');
    }
    if (request.user.role === 'HEAD' || request.user.role === 'DEPUTY') {
      const editor = await this.prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: group.id, userId: request.user.id },
        },
      });
      if (!editor) throw new ForbiddenException();
    }
    const ids = input.entries.map((entry) => entry.studentId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Повторяющиеся студенты');
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId: group.id,
        userId: { in: ids },
        user: { role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] } },
      },
    });
    if (members.length !== ids.length)
      throw new ForbiddenException('Студент не принадлежит группе');
    await this.prisma.$transaction(async (tx) => {
      for (const entry of input.entries) {
        const old = await tx.attendance.findUnique({
          where: {
            lessonId_studentId: { lessonId: id, studentId: entry.studentId },
          },
        });
        if (old?.status === entry.status) continue;
        const attendance = await tx.attendance.upsert({
          where: {
            lessonId_studentId: { lessonId: id, studentId: entry.studentId },
          },
          create: {
            lessonId: id,
            studentId: entry.studentId,
            status: entry.status,
            markedBy: request.user.id,
          },
          update: {
            status: entry.status,
            markedBy: request.user.id,
            markedAt: new Date(),
            confirmedAt: null,
          },
        });
        await tx.attendanceHistory.create({
          data: {
            attendanceId: attendance.id,
            oldStatus: old?.status,
            newStatus: entry.status,
            changedBy: request.user.id,
            reason: input.reason,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'ATTENDANCE_MARK',
            entityType: 'Attendance',
            entityId: attendance.id,
            oldData: old ? { status: old.status } : undefined,
            newData: { status: entry.status },
          },
        });
        await tx.notification.create({
          data: {
            userId: entry.studentId,
            type: 'ATTENDANCE_CHANGED',
            title: old ? 'Отметка изменена' : 'Появилась отметка',
            body: `${date}, ${lesson.lessonNumber} пара: ${entry.status}`,
          },
        });
      }
    });
    return { ok: true };
  }

  @Get('attendance/me')
  async mine(@Req() request: AuthRequest) {
    if (request.user.role === 'PARENT') throw new ForbiddenException();
    return this.prisma.attendance.findMany({
      where: { studentId: request.user.id },
      include: {
        lesson: { include: { subject: true, teacher: true } },
        history: {
          include: {
            editor: { select: { firstName: true, lastName: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        disputes: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { lesson: { date: 'desc' } },
    });
  }

  @Post('attendance/:id/confirm')
  async confirm(@Req() request: AuthRequest, @Param('id') id: string) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
    });
    if (
      !attendance ||
      attendance.studentId !== request.user.id ||
      request.user.role === 'PARENT'
    )
      throw new ForbiddenException();
    if (attendance.confirmedAt)
      return { ok: true, confirmedAt: attendance.confirmedAt };
    const confirmedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.attendance.update({ where: { id }, data: { confirmedAt } });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'ATTENDANCE_CONFIRM',
          entityType: 'Attendance',
          entityId: id,
          newData: {
            status: attendance.status,
            confirmedAt: confirmedAt.toISOString(),
          },
        },
      });
    });
    return { ok: true, confirmedAt };
  }

  @Post('attendance/:id/dispute')
  async dispute(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { comment } = parseInput(
      z.object({ comment: z.string().min(5) }),
      body,
    );
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
    });
    if (!attendance || attendance.studentId !== request.user.id)
      throw new ForbiddenException();
    const pending = await this.prisma.attendanceDispute.findFirst({
      where: {
        attendanceId: id,
        studentId: request.user.id,
        status: 'PENDING',
      },
    });
    if (pending)
      throw new BadRequestException('Спор по этой отметке уже рассматривается');
    return this.prisma.attendanceDispute.create({
      data: { attendanceId: id, studentId: request.user.id, comment },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Get('curator/disputes')
  disputes() {
    return this.prisma.attendanceDispute.findMany({
      where: { status: 'PENDING' },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true },
        },
        attendance: {
          include: { lesson: { include: { subject: true } }, history: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Post('curator/disputes/:id/resolve')
  async resolve(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(
      z.object({
        status: z.enum(['APPROVED', 'REJECTED', 'MORE_INFO']),
        decision: z.string().min(3),
        attendanceStatus: z
          .enum([
            'PRESENT',
            'ABSENT',
            'LATE',
            'LEFT_EARLY',
            'EXCUSED',
            'EXEMPT',
            'NEEDS_REVIEW',
          ])
          .optional(),
      }),
      body,
    );
    const dispute = await this.prisma.attendanceDispute.findUnique({
      where: { id },
    });
    if (!dispute || dispute.status !== 'PENDING') throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      if (input.attendanceStatus) {
        const previous = await tx.attendance.findUniqueOrThrow({
          where: { id: dispute.attendanceId },
        });
        await tx.attendance.update({
          where: { id: dispute.attendanceId },
          data: {
            status: input.attendanceStatus,
            markedBy: request.user.id,
            confirmedAt: null,
          },
        });
        await tx.attendanceHistory.create({
          data: {
            attendanceId: dispute.attendanceId,
            oldStatus: previous.status,
            newStatus: input.attendanceStatus,
            changedBy: request.user.id,
            reason: input.decision,
          },
        });
      }
      const result = await tx.attendanceDispute.update({
        where: { id },
        data: {
          status: input.status,
          decision: input.decision,
          reviewedBy: request.user.id,
          reviewedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'DISPUTE_RESOLVE',
          entityType: 'AttendanceDispute',
          entityId: id,
          newData: { status: input.status, decision: input.decision },
        },
      });
      await tx.notification.create({
        data: {
          userId: dispute.studentId,
          type: 'DISPUTE_RESOLVED',
          title: 'Спор рассмотрен',
          body: input.decision,
        },
      });
      return result;
    });
  }
}
