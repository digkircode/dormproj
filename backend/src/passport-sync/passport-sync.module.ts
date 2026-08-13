import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalPassportApiService } from './external-passport-api.service';
import { PassportSyncController } from './passport-sync.controller';
import { PassportSyncService } from './passport-sync.service';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [PassportSyncController],
  providers: [ExternalPassportApiService, PassportSyncService],
  exports: [PassportSyncService],
})
export class PassportSyncModule {}
