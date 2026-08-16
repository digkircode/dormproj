import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IndividualsSyncModule } from '../individuals-sync/individuals-sync.module';
import { CitizenshipSyncModule } from '../citizenship-sync/citizenship-sync.module';
import { PassportSyncModule } from '../passport-sync/passport-sync.module';
import { ContactInfoSyncModule } from '../contact-info-sync/contact-info-sync.module';
import { SyncController } from './sync.controller';
import { ExternalStudentApiService } from './external-student-api.service';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    IndividualsSyncModule,
    CitizenshipSyncModule,
    PassportSyncModule,
    ContactInfoSyncModule,
  ],
  controllers: [SyncController],
  providers: [ExternalStudentApiService, SyncService, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}
