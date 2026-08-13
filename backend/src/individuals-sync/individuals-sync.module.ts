import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalIndividualApiService } from './external-individual-api.service';
import { IndividualsSyncController } from './individuals-sync.controller';
import { IndividualsSyncService } from './individuals-sync.service';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [IndividualsSyncController],
  providers: [ExternalIndividualApiService, IndividualsSyncService],
  exports: [IndividualsSyncService],
})
export class IndividualsSyncModule {}
