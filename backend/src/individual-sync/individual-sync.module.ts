import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncModule } from '../sync/sync.module';
import { IndividualsSyncModule } from '../individuals-sync/individuals-sync.module';
import { CitizenshipSyncModule } from '../citizenship-sync/citizenship-sync.module';
import { PassportSyncModule } from '../passport-sync/passport-sync.module';
import { ContactInfoSyncModule } from '../contact-info-sync/contact-info-sync.module';
import { IndividualSyncController } from './individual-sync.controller';
import { IndividualSyncService } from './individual-sync.service';

@Module({
  imports: [AuthModule, SyncModule, IndividualsSyncModule, CitizenshipSyncModule, PassportSyncModule, ContactInfoSyncModule],
  controllers: [IndividualSyncController],
  providers: [IndividualSyncService],
  exports: [IndividualSyncService],
})
export class IndividualSyncModule {}
