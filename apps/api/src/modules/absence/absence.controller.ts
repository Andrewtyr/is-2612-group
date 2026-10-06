import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { parseInput } from '../../common/input';
import { isoDate } from '../../common/group';
import type { AuthRequest } from '../../common/auth.guard';
import { z } from 'zod';

const reasonSchema = z.object({
  date: z.iso.date(),
  lessonId: z.string().optional(),
  category: z.enum([
    'болезнь',
    'семейные обстоятельства',
    'соревнования',
    'официальное мероприятие',
    'практика',
    'транспорт',
    'другая причина',
  ]),
  comment: z.string().max(2000).optional(),
});

@Controller()
export class AbsenceController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post('absence-reasons')
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    if (request.user.role === 'PARENT') throw new ForbiddenException();
    const input = parseInput(reasonSchema, body);
    const reason = await this.prisma.absenceReason.create({
      data: {
        studentId: request.user.id,
        date: isoDate(input.date),
        lessonId: input.lessonId,
        category: input.category,
        comment: input.comment,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'ABSENCE_REASON_CREATE',
        entityType: 'AbsenceReason',
        entityId: reason.id,
        newData: { date: input.date, category: input.category },
      },
    });
    return reason;
  }

  @Get('absence-reasons/me')
  mine(@Req() request: AuthRequest) {
    if (request.user.role === 'PARENT') throw new ForbiddenException();
    return this.prisma.absenceReason.findMany({
      where: { studentId: request.user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Get('curator/absence-reasons')
  list() {
    return this.prisma.absenceReason.findMany({
      where: { status: 'PENDING' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Post('curator/absence-reasons/:id/review')
  async review(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status } = parseInput(
      z.object({ status: z.enum(['APPROVED', 'REJECTED', 'MORE_INFO']) }),
      body,
    );
    const old = await this.prisma.absenceReason.findUnique({ where: { id } });
    if (!old || old.status !== 'PENDING') throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.absenceReason.update({
        where: { id },
        data: { status, reviewedBy: request.user.id },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'ABSENCE_REASON_REVIEW',
          entityType: 'AbsenceReason',
          entityId: id,
          oldData: { status: old.status },
          newData: { status },
        },
      });
      return updated;
    });
  }
}
