import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
