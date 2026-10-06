import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';
import { parseInput } from '../../common/input';
import { primaryGroup } from '../../common/group';
import type { AuthRequest } from '../../common/auth.guard';
import { hash } from 'bcryptjs';
import { z } from 'zod';

@Controller('users')
export class UsersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Roles('CURATOR', 'ADMIN', 'HEAD', 'DEPUTY')
  @Get('group')
  async group() {
    const group = await primaryGroup(this.prisma);
    return this.prisma.groupMember.findMany({
      where: { groupId: group.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: { user: { lastName: 'asc' } },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Post()
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parseInput(
      z.object({
        login: z.string().min(3),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        middleName: z.string().optional(),
        password: z.string().min(12),
        role: z.enum(['STUDENT', 'HEAD', 'DEPUTY', 'CURATOR']),
      }),
      body,
    );
    if (input.role === 'CURATOR' && request.user.role !== 'ADMIN')
      throw new ForbiddenException();
    const group = await primaryGroup(this.prisma);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          login: input.login,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          passwordHash: await hash(input.password, 12),
          role: input.role,
          memberships: { create: { groupId: group.id } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'USER_CREATE',
          entityType: 'User',
          entityId: created.id,
          newData: { login: created.login, role: created.role },
        },
      });
      return created;
    });
    return { id: user.id, login: user.login, role: user.role };
  }
}
