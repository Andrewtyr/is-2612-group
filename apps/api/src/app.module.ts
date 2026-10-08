import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from './database/prisma.service';
import { AuthGuard } from './common/auth.guard';
import { RolesGuard } from './common/roles.guard';
import { AuthController } from './modules/auth/auth.controller';
import { HealthController } from './modules/health/health.controller';
import { ScheduleController } from './modules/schedule/schedule.controller';
import { AttendanceController } from './modules/attendance/attendance.controller';
import { UsersController } from './modules/users/users.controller';
import { StatisticsController } from './modules/statistics/statistics.controller';
import { AbsenceController } from './modules/absence/absence.controller';
import { AcademyService } from './integrations/academy/academy.service';
import { AuditController } from './modules/audit/audit.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { MaxBotController } from './integrations/max/max-bot.controller';
import { MaxBotService } from './integrations/max/max-bot.service';

@Module({
  controllers: [
    AuthController,
    HealthController,
    ScheduleController,
    AttendanceController,
    UsersController,
    StatisticsController,
    AbsenceController,
    AuditController,
    NotificationsController,
    MaxBotController,
  ],
  providers: [
    PrismaService,
    AcademyService,
    MaxBotService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
