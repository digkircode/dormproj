import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalCitizenshipApiService } from './external-citizenship-api.service';
import { CitizenshipSyncController } from './citizenship-sync.controller';
import { CitizenshipSyncService } from './citizenship-sync.service';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [CitizenshipSyncController],
  providers: [ExternalCitizenshipApiService, CitizenshipSyncService],
  exports: [CitizenshipSyncService],
})
export class CitizenshipSyncModule {}
