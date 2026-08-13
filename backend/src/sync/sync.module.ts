import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IndividualsSyncModule } from '../individuals-sync/individuals-sync.module';
import { CitizenshipSyncModule } from '../citizenship-sync/citizenship-sync.module';
import { PassportSyncModule } from '../passport-sync/passport-sync.module';
import { SyncController } from './sync.controller';
import { ExternalStudentApiService } from './external-student-api.service';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({
  imports: [HttpModule, AuthModule, IndividualsSyncModule, CitizenshipSyncModule, PassportSyncModule],
  controllers: [SyncController],
  providers: [ExternalStudentApiService, SyncService, SyncScheduler],
})
export class SyncModule {}
