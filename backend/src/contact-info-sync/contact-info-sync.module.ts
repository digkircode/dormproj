import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalContactInfoApiService } from './external-contact-info-api.service';
import { ContactInfoSyncController } from './contact-info-sync.controller';
import { ContactInfoSyncService } from './contact-info-sync.service';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [ContactInfoSyncController],
  providers: [ExternalContactInfoApiService, ContactInfoSyncService],
  exports: [ContactInfoSyncService],
})
export class ContactInfoSyncModule {}
