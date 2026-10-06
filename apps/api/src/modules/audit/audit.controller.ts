import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Roles } from '../../common/roles.decorator';

@Controller('audit')
export class AuditController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Roles('CURATOR', 'ADMIN')
  @Get()
  list() {
    return this.prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });
  }
}
