import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
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
import { canManageUser } from './user-policy';

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
  @Get('manage')
  async manage() {
    const group = await primaryGroup(this.prisma);
    return this.prisma.groupMember.findMany({
      where: { groupId: group.id },
      include: {
        user: {
          select: {
            id: true,
            login: true,
            firstName: true,
            lastName: true,
            middleName: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: { user: { lastName: 'asc' } },
    });
  }

  @Roles('CURATOR', 'ADMIN')
  @Patch(':id')
  async update(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(
      z
        .object({
          role: z.enum(['STUDENT', 'HEAD', 'DEPUTY', 'CURATOR']).optional(),
          status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
        })
        .refine((value) => value.role || value.status, {
          message: 'Укажите роль или статус',
        }),
      body,
    );
    const group = await primaryGroup(this.prisma);
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: id } },
      include: { user: true },
    });
    if (!member) throw new NotFoundException();
    if (
      !canManageUser(
        request.user.role,
        member.user.role,
        input.role ?? member.user.role,
        request.user.id === id,
      )
    )
      throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      if (
        (input.role === 'HEAD' || input.role === 'DEPUTY') &&
        input.role !== member.user.role
      ) {
        const previous = await tx.groupMember.findMany({
          where: { groupId: group.id, user: { role: input.role } },
          include: { user: true },
        });
        for (const old of previous) {
          await tx.user.update({
            where: { id: old.userId },
            data: { role: 'STUDENT' },
          });
          await tx.auditLog.create({
            data: {
              userId: request.user.id,
              action: 'USER_ROLE_CHANGE',
              entityType: 'User',
              entityId: old.userId,
              oldData: { role: old.user.role },
              newData: { role: 'STUDENT' },
            },
          });
        }
      }
      const updated = await tx.user.update({
        where: { id },
        data: { role: input.role, status: input.status },
        select: { id: true, login: true, role: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'USER_UPDATE',
          entityType: 'User',
          entityId: id,
          oldData: { role: member.user.role, status: member.user.status },
          newData: { role: updated.role, status: updated.status },
        },
      });
      return updated;
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
