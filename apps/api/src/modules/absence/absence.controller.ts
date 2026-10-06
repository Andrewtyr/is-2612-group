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
  Req,
  Res,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { parseInput } from '../../common/input';
import { isoDate, primaryGroup } from '../../common/group';
import type { AuthRequest } from '../../common/auth.guard';
import { z } from 'zod';
import type { Response } from 'express';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { maxAttachmentSize, validateAttachment } from './attachment-validation';

const uploadDir = resolve(process.env.UPLOAD_DIR ?? 'uploads');

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
    if (input.lessonId) {
      const group = await primaryGroup(this.prisma);
      const lesson = await this.prisma.lesson.findFirst({
        where: {
          id: input.lessonId,
          groupId: group.id,
          date: isoDate(input.date),
        },
      });
      if (!lesson)
        throw new BadRequestException('Пара не соответствует выбранной дате');
    }
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
      include: {
        attachments: {
          select: { id: true, fileName: true, size: true, mimeType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('absence-reasons/:id/attachments')
  async upload(@Req() request: AuthRequest, @Param('id') id: string) {
    const reason = await this.prisma.absenceReason.findUnique({
      where: { id },
    });
    if (!reason || reason.studentId !== request.user.id)
      throw new ForbiddenException();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      size += buffer.length;
      if (size > maxAttachmentSize)
        throw new PayloadTooLargeException('Документ больше 5 МБ');
      chunks.push(buffer);
    }
    let originalName = 'документ';
    try {
      originalName = decodeURIComponent(
        String(request.headers['x-file-name'] ?? 'документ'),
      );
    } catch {
      throw new BadRequestException('Некорректное имя файла');
    }
    const contents = Buffer.concat(chunks);
    const checked = validateAttachment(
      String(request.headers['content-type'] ?? ''),
      contents,
      originalName,
    );
    const storageKey = randomUUID() + checked.extension;
    await mkdir(uploadDir, { recursive: true });
    await writeFile(resolve(uploadDir, storageKey), contents, { flag: 'wx' });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            absenceReasonId: id,
            fileName: checked.fileName,
            storageKey,
            mimeType: checked.mimeType,
            size: contents.length,
          },
          select: { id: true, fileName: true, size: true, mimeType: true },
        });
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'ABSENCE_ATTACHMENT_ADD',
            entityType: 'Attachment',
            entityId: attachment.id,
            newData: { absenceReasonId: id, fileName: checked.fileName },
          },
        });
        return attachment;
      });
    } catch (error) {
      await unlink(resolve(uploadDir, storageKey)).catch(() => {});
      throw error;
    }
  }

  @Get('attachments/:id')
  async download(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { absenceReason: { select: { studentId: true } } },
    });
    if (!attachment) throw new NotFoundException();
    if (
      attachment.absenceReason.studentId !== request.user.id &&
      !['CURATOR', 'ADMIN'].includes(request.user.role)
    )
      throw new ForbiddenException();
    const contents = await readFile(resolve(uploadDir, attachment.storageKey));
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(contents);
  }

  @Roles('CURATOR', 'ADMIN')
  @Get('curator/absence-reasons')
  list() {
    return this.prisma.absenceReason.findMany({
      where: { status: 'PENDING' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        attachments: {
          select: { id: true, fileName: true, size: true, mimeType: true },
        },
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
      await tx.notification.create({
        data: {
          userId: old.studentId,
          type: 'ABSENCE_REVIEWED',
          title: 'Причина отсутствия рассмотрена',
          body:
            status === 'APPROVED'
              ? 'Причина подтверждена'
              : status === 'REJECTED'
                ? 'Причина отклонена'
                : 'Запрошены дополнительные сведения',
        },
      });
      return updated;
    });
  }
}
