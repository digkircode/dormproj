import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { PenaltyScheduler } from './penalty.scheduler';
import { ContractStatusScheduler } from './contract-status.scheduler';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [PenaltyScheduler, ContractStatusScheduler],
})
export class BillingModule {}
