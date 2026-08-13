import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncController } from './sync.controller';
import { ExternalStudentApiService } from './external-student-api.service';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [SyncController],
  providers: [ExternalStudentApiService, SyncService, SyncScheduler],
})
export class SyncModule {}
