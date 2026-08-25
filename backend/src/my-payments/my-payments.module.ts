import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcquiringModule } from '../acquiring/acquiring.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { MyPaymentsController } from './my-payments.controller';
import { PaymentRateLimiterService } from './payment-rate-limiter.service';

@Module({
  imports: [AuthModule, AuditLogModule, AcquiringModule, FiscalModule],
  controllers: [MyPaymentsController],
  providers: [PaymentRateLimiterService],
})
export class MyPaymentsModule {}
