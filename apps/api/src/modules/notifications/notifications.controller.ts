import {
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
import type { AuthRequest } from '../../common/auth.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() request: AuthRequest) {
    return this.prisma.notification.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post(':id/read')
  async read(@Req() request: AuthRequest, @Param('id') id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException();
    if (notification.userId !== request.user.id) throw new ForbiddenException();
    if (notification.readAt) return { ok: true };
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
