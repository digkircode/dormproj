import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { SyncModule } from './sync/sync.module';
import { IndividualsSyncModule } from './individuals-sync/individuals-sync.module';
import { CitizenshipSyncModule } from './citizenship-sync/citizenship-sync.module';
import { PassportSyncModule } from './passport-sync/passport-sync.module';
import { ContactInfoSyncModule } from './contact-info-sync/contact-info-sync.module';
import { IndividualSyncModule } from './individual-sync/individual-sync.module';
import { StudentsModule } from './students/students.module';
import { IndividualsModule } from './individuals/individuals.module';
import { CitizenshipModule } from './citizenship/citizenship.module';
import { PassportModule } from './passport/passport.module';
import { ContactInfoModule } from './contact-info/contact-info.module';
import { RoomsModule } from './rooms/rooms.module';
import { RoomCharacteristicDefinitionsModule } from './room-characteristic-definitions/room-characteristic-definitions.module';
import { DormitoryInfoModule } from './dormitory-info/dormitory-info.module';
import { AuthModule } from './auth/auth.module';
import { ContractsModule } from './contracts/contracts.module';
import { BillingModule } from './billing/billing.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PublicInfoModule } from './public-info/public-info.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // Глобальный лимит на все эндпоинты — 100 запросов в минуту с одного IP.
    // Публичного API без авторизации это не заменяет, но защищает от простого
    // скрипта, который бьёт запросами напрямую (см. обсуждение — эндпоинты открыты всем).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
    }),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    SyncModule,
    IndividualsSyncModule,
    CitizenshipSyncModule,
    PassportSyncModule,
    ContactInfoSyncModule,
    IndividualSyncModule,
    StudentsModule,
    IndividualsModule,
    CitizenshipModule,
    PassportModule,
    ContactInfoModule,
    RoomsModule,
    RoomCharacteristicDefinitionsModule,
    DormitoryInfoModule,
    ContractsModule,
    BillingModule,
    ReportsModule,
    UsersModule,
    RolesModule,
    PublicInfoModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
