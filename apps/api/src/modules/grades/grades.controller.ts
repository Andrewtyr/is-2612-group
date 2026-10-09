import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { isoDate, primaryGroup } from '../../common/group';
import { parseInput } from '../../common/input';
import type { AuthRequest } from '../../common/auth.guard';
import { parseGradePdf } from './grade-pdf';
import { z } from 'zod';

const importSchema = z.object({
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().min(1).max(255),
  academicYearStart: z.number().int().min(2000).max(2100),
  entries: z
    .array(
      z.object({
        studentId: z.string(),
        subject: z.string().min(1).max(200),
        date: z.iso.date(),
        columnIndex: z.number().int().min(0).max(500),
        value: z.string().regex(/^[2-5]$|^нб$/i),
      }),
    )
    .min(1)
    .max(5000),
});

function normalizedName(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^а-я]/g, '');
}

@Controller('grades')
export class GradesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Roles('STUDENT', 'HEAD', 'DEPUTY')
  @Get('me')
  mine(@Req() request: AuthRequest) {
    return this.prisma.gradeEntry.findMany({
      where: { studentId: request.user.id },
      select: {
        id: true,
        subject: true,
        date: true,
        value: true,
        columnIndex: true,
      },
      orderBy: [{ subject: 'asc' }, { date: 'asc' }, { columnIndex: 'asc' }],
    });
  }

  @Roles('ADMIN')
  @Get('students')
  async students() {
    const group = await primaryGroup(this.prisma);
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId: group.id,
        user: { role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] }, status: 'ACTIVE' },
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
    });
    return members.map(({ user }) => ({
      id: user.id,
      name: [user.lastName, user.firstName, user.middleName]
        .filter(Boolean)
        .join(' '),
    }));
  }

  @Roles('ADMIN')
  @Post('preview')
  async preview(@Req() request: AuthRequest, @Query('year') yearText?: string) {
    const academicYearStart = Number(yearText);
    if (
      !Number.isInteger(academicYearStart) ||
      academicYearStart < 2000 ||
      academicYearStart > 2100
    )
      throw new BadRequestException('Укажите первый год учебного года');
    if (
      !String(request.headers['content-type'] ?? '').includes('application/pdf')
    )
      throw new BadRequestException('Нужен файл PDF');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      size += buffer.length;
      if (size > 10_000_000)
        throw new PayloadTooLargeException('PDF больше 10 МБ');
      chunks.push(buffer);
    }
    const data = Buffer.concat(chunks);
    if (!data.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new BadRequestException('Файл не является PDF');
    let pages;
    try {
      pages = await parseGradePdf(new Uint8Array(data), academicYearStart);
    } catch {
      throw new BadRequestException('Не удалось прочитать PDF с оценками');
    }
    if (!pages.length)
      throw new BadRequestException(
        'Не найдены таблицы с предметом и датами. Проверьте PDF или его качество.',
      );
    const students = await this.students();
    const studentByName = new Map(
      students.map((student) => [normalizedName(student.name), student.id]),
    );
    return {
      checksum: createHash('sha256').update(data).digest('hex'),
      academicYearStart,
      pages: pages.map((page) => ({
        ...page,
        rows: page.rows.map((row) => ({
          ...row,
          studentId: studentByName.get(normalizedName(row.name)) ?? null,
        })),
      })),
    };
  }

  @Roles('ADMIN')
  @Post('import')
  async importGrades(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parseInput(importSchema, body);
    const previous = await this.prisma.gradeImport.findUnique({
      where: { checksum: input.checksum },
    });
    if (previous) return { imported: 0, alreadyImported: true };
    const group = await primaryGroup(this.prisma);
    const ids = [...new Set(input.entries.map((entry) => entry.studentId))];
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId: group.id,
        userId: { in: ids },
        user: { role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] }, status: 'ACTIVE' },
      },
    });
    if (members.length !== ids.length)
      throw new BadRequestException('В списке есть ученик вне группы');
    const keys = input.entries.map(
      (entry) =>
        `${entry.studentId}|${entry.subject}|${entry.date}|${entry.columnIndex}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new BadRequestException('В файле есть повторяющиеся оценки');
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.gradeImport.create({
          data: {
            checksum: input.checksum,
            fileName: input.fileName.replace(/[\\/]/g, '_'),
            academicYearStart: input.academicYearStart,
            createdBy: request.user.id,
          },
        });
        for (const entry of input.entries) {
          const date = isoDate(entry.date);
          await tx.gradeEntry.upsert({
            where: {
              studentId_subject_date_columnIndex: {
                studentId: entry.studentId,
                subject: entry.subject,
                date,
                columnIndex: entry.columnIndex,
              },
            },
            create: {
              studentId: entry.studentId,
              subject: entry.subject,
              date,
              columnIndex: entry.columnIndex,
              value: entry.value.toLocaleLowerCase('ru-RU'),
              importId: batch.id,
            },
            update: {
              value: entry.value.toLocaleLowerCase('ru-RU'),
              importId: batch.id,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'GRADES_IMPORT',
            entityType: 'GradeImport',
            entityId: batch.id,
            newData: { count: input.entries.length, checksum: input.checksum },
          },
        });
        return { imported: input.entries.length, alreadyImported: false };
      },
      { timeout: 120_000 },
    );
  }
}
