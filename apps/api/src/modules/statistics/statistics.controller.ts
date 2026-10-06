import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { primaryGroup } from '../../common/group';
import type { AuthRequest } from '../../common/auth.guard';
import { attendanceSummary } from './statistics';

@Controller('statistics')
export class StatisticsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async forStudent(studentId: string, groupId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: { groupId, date: { lte: new Date() } },
      include: { attendances: { where: { studentId } } },
    });
    return attendanceSummary(
      lessons.map((lesson) => ({
        lessonStatus: lesson.status,
        attendanceStatus: lesson.attendances[0]?.status ?? null,
      })),
    );
  }

  @Get('me')
  async mine(@Req() request: AuthRequest) {
    if (request.user.role === 'PARENT') throw new ForbiddenException();
    const group = await primaryGroup(this.prisma);
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: request.user.id } },
    });
    if (!member) throw new ForbiddenException();
    return this.forStudent(request.user.id, group.id);
  }

  @Roles('CURATOR', 'ADMIN')
  @Get('group')
  async group() {
    const group = await primaryGroup(this.prisma);
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
    return Promise.all(
      members.map(async ({ user }) => ({
        student: user,
        summary: await this.forStudent(user.id, group.id),
      })),
    );
  }
}
