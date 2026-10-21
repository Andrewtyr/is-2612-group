import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { isoDate, primaryGroup } from '../../common/group';
import { parseInput } from '../../common/input';
import type { AuthRequest } from '../../common/auth.guard';
import { parseGradePdf } from './grade-pdf';
import { parseGradeXps } from './grade-xps';
import { parseGradeExcel } from './grade-excel';
import { normalizeGradeSubject, planGradeImport } from './grade-import';
import { renderStudentGradesPdf } from './grade-export';
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

  private async studentGrades(id: string) {
    const group = await primaryGroup(this.prisma);
    const member = await this.prisma.groupMember.findFirst({
      where: {
        groupId: group.id,
        userId: id,
        user: { role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] }, status: 'ACTIVE' },
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, middleName: true },
        },
      },
    });
    if (!member) throw new NotFoundException('Ученик не найден в группе');
    const grades = await this.prisma.gradeEntry.findMany({
      where: { studentId: id },
      select: {
        id: true,
        subject: true,
        date: true,
        value: true,
        columnIndex: true,
      },
      orderBy: [{ subject: 'asc' }, { date: 'asc' }, { columnIndex: 'asc' }],
    });
    return {
      student: {
        id,
        name: [
          member.user.lastName,
          member.user.firstName,
          member.user.middleName,
        ]
          .filter(Boolean)
          .join(' '),
      },
      grades,
    };
  }

  @Roles('ADMIN')
  @Get('students/:id/pdf')
  async studentPdf(@Param('id') id: string, @Res() response: Response) {
    const result = await this.studentGrades(id);
    const pdf = await renderStudentGradesPdf(
      result.student.name,
      result.grades,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="grades-${id}.pdf"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(pdf);
  }

  @Roles('ADMIN')
  @Get('students/:id')
  student(@Param('id') id: string) {
    return this.studentGrades(id);
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
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      size += buffer.length;
      if (size > 10_000_000)
        throw new PayloadTooLargeException('Файл больше 10 МБ');
      chunks.push(buffer);
    }
    const data = Buffer.concat(chunks);
    const isPdf = data.subarray(0, 5).equals(Buffer.from('%PDF-'));
    const isXls = data
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    const isZip = data
      .subarray(0, 4)
      .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const mime = String(request.headers['content-type'] ?? '')
      .split(';')[0]
      .toLowerCase();
    const isXlsx =
      isZip &&
      mime ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isXps = isZip && !isXlsx;
    if (!isPdf && !isXls && !isXlsx && !isXps) {
      throw new BadRequestException('Нужен файл PDF, XPS, XLS или XLSX');
    }
    const format = isPdf ? 'pdf' : isXls || isXlsx ? 'excel' : 'xps';
    let pages;
    try {
      pages = isPdf
        ? await parseGradePdf(new Uint8Array(data), academicYearStart)
        : format === 'excel'
          ? parseGradeExcel(data, academicYearStart)
          : await parseGradeXps(data, academicYearStart);
    } catch (error) {
      if (
        format === 'excel' &&
        error instanceof Error &&
        /Не найдены|Не удалось|Неверная дата|Слишком много|В Excel|не похож|слишком много/u.test(
          error.message,
        )
      ) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('Не удалось прочитать журнал с оценками');
    }
    if (!pages.length)
      throw new BadRequestException(
        'Не найдены таблицы с предметом и датами. Проверьте файл или его качество.',
      );
    const students = await this.students();
    const studentByName = new Map(
      students.map((student) => [normalizedName(student.name), student.id]),
    );
    return {
      checksum: createHash('sha256').update(data).digest('hex'),
      academicYearStart,
      format,
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
    const existingBatch = await this.prisma.gradeImport.findUnique({
      where: { checksum: input.checksum },
    });
    if (existingBatch)
      return { imported: 0, updated: 0, unchanged: 0, alreadyImported: true };

    const entries = input.entries.map((entry) => ({
      ...entry,
      subject: normalizeGradeSubject(entry.subject),
      value: entry.value.toLocaleLowerCase('ru-RU'),
    }));
    const sourceKeys = entries.map((entry) =>
      JSON.stringify([
        entry.studentId,
        entry.subject.toLocaleLowerCase('ru-RU'),
        entry.date,
        entry.columnIndex,
      ]),
    );
    if (new Set(sourceKeys).size !== sourceKeys.length)
      throw new BadRequestException('В файле есть повторяющиеся оценки');
    const group = await primaryGroup(this.prisma);
    const studentIds = [...new Set(entries.map((entry) => entry.studentId))];
    const dates = entries.map((entry) => entry.date).sort();
    const academicFrom = String(input.academicYearStart) + '-08-01';
    const academicTo = String(input.academicYearStart + 1) + '-07-31';
    if (dates[0] < academicFrom || dates[dates.length - 1] > academicTo) {
      throw new BadRequestException(
        'Даты оценок выходят за пределы учебного года',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const repeat = await tx.gradeImport.findUnique({
          where: { checksum: input.checksum },
        });
        if (repeat)
          return {
            imported: 0,
            updated: 0,
            unchanged: 0,
            alreadyImported: true,
          };
        const members = await tx.groupMember.findMany({
          where: {
            groupId: group.id,
            userId: { in: studentIds },
            user: {
              role: { in: ['STUDENT', 'HEAD', 'DEPUTY'] },
              status: 'ACTIVE',
            },
          },
        });
        if (members.length !== studentIds.length)
          throw new BadRequestException('В списке есть ученик вне группы');
        const stored = await tx.gradeEntry.findMany({
          where: {
            studentId: { in: studentIds },
            date: { gte: isoDate(academicFrom), lte: isoDate(academicTo) },
          },
          orderBy: [{ date: 'asc' }, { columnIndex: 'asc' }],
          select: {
            id: true,
            studentId: true,
            subject: true,
            date: true,
            columnIndex: true,
            value: true,
          },
        });
        const plan = planGradeImport(entries, stored);
        const batch = await tx.gradeImport.create({
          data: {
            checksum: input.checksum,
            fileName: input.fileName.replace(/[\\/]/g, '_'),
            academicYearStart: input.academicYearStart,
            createdBy: request.user.id,
          },
        });
        let imported = 0;
        let updated = 0;
        let unchanged = 0;
        for (const operation of plan) {
          if (operation.type === 'unchanged') {
            unchanged++;
          } else if (operation.type === 'update') {
            await tx.gradeEntry.update({
              where: { id: operation.id },
              data: { value: operation.value, importId: batch.id },
            });
            updated++;
          } else {
            await tx.gradeEntry.create({
              data: {
                studentId: operation.entry.studentId,
                subject: operation.subject,
                date: isoDate(operation.entry.date),
                columnIndex: operation.columnIndex,
                value: operation.entry.value,
                importId: batch.id,
              },
            });
            imported++;
          }
        }
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'GRADES_IMPORT',
            entityType: 'GradeImport',
            entityId: batch.id,
            newData: { imported, updated, unchanged, checksum: input.checksum },
          },
        });
        return { imported, updated, unchanged, alreadyImported: false };
      },
      { timeout: 120_000 },
    );
  }
}
