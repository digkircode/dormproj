import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { Accounting1cModule } from '../accounting-1c/accounting-1c.module';
import { BillingController } from './billing.controller';
import { PenaltyScheduler } from './penalty.scheduler';
import { ContractStatusScheduler } from './contract-status.scheduler';
import { Accounting1cPushService } from './accounting-1c-push.service';
import { Accounting1cPushScheduler } from './accounting-1c-push.scheduler';

@Module({
  imports: [AuthModule, Accounting1cModule],
  controllers: [BillingController],
  providers: [PenaltyScheduler, ContractStatusScheduler, Accounting1cPushService, Accounting1cPushScheduler],
})
export class BillingModule {}
