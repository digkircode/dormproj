import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { PenaltyScheduler } from './penalty.scheduler';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [PenaltyScheduler],
})
export class BillingModule {}
