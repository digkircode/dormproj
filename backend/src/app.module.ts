import path from 'path';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { I18nModule, HeaderResolver } from 'nestjs-i18n';
import { AppController } from './app.controller';
import { I18nHttpExceptionFilter } from './i18n/http-exception.filter';
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
import { ChatsModule } from './chats/chats.module';
import { MyPaymentsModule } from './my-payments/my-payments.module';
import { AnnouncementsModule } from './announcements/announcements.module';

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
    // i18n/ рядом с templates/ (не под src/) — Dockerfile копирует dist/+templates/, но не
    // src/, тот же принцип, что у печатных бланков (см. contract-document.ts). Язык
    // резолвится из Accept-Language, который фронт шлёт на каждый запрос (см. api-base.ts) —
    // без изменений в сессии/БД, язык остаётся клиентским выбором, не серверной настройкой.
    I18nModule.forRoot({
      fallbackLanguage: 'ru',
      loaderOptions: { path: path.join(process.cwd(), 'i18n'), watch: process.env.NODE_ENV !== 'production' },
      resolvers: [new HeaderResolver(['accept-language'])],
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
    ChatsModule,
    MyPaymentsModule,
    AnnouncementsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: I18nHttpExceptionFilter },
  ],
})
export class AppModule {}
