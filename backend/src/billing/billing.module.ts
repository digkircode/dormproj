import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { Accounting1cModule } from '../accounting-1c/accounting-1c.module';
import { BillingController } from './billing.controller';
import { PenaltyScheduler } from './penalty.scheduler';
import { PenaltyRecalculateService } from './penalty-recalculate.service';
import { ContractStatusScheduler } from './contract-status.scheduler';
import { Accounting1cPushService } from './accounting-1c-push.service';
import { Accounting1cPushScheduler } from './accounting-1c-push.scheduler';
import { ServiceProvisionDocService } from './service-provision-doc.service';
import { ServiceProvisionDocScheduler } from './service-provision-doc.scheduler';

@Module({
  imports: [AuthModule, Accounting1cModule],
  controllers: [BillingController],
  providers: [
    PenaltyScheduler,
    PenaltyRecalculateService,
    ContractStatusScheduler,
    Accounting1cPushService,
    Accounting1cPushScheduler,
    ServiceProvisionDocService,
    ServiceProvisionDocScheduler,
  ],
})
export class BillingModule {}
