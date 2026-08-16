import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IndividualSyncModule } from '../individual-sync/individual-sync.module';
import { IndividualsController } from './individuals.controller';

@Module({
  imports: [AuthModule, IndividualSyncModule],
  controllers: [IndividualsController],
})
export class IndividualsModule {}
