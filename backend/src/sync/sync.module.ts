import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { ExternalStudentApiService } from './external-student-api.service';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({
  imports: [HttpModule],
  controllers: [SyncController],
  providers: [ExternalStudentApiService, SyncService, SyncScheduler],
})
export class SyncModule {}
