import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { Accounting1cModule } from '../accounting-1c/accounting-1c.module';
import { PaymentImportsController } from './payment-imports.controller';
import { PaymentImportsIngestService } from './payment-imports-ingest.service';
import { PaymentImportsIngestScheduler } from './payment-imports-ingest.scheduler';

@Module({
  imports: [AuthModule, Accounting1cModule],
  controllers: [PaymentImportsController],
  providers: [PaymentImportsIngestService, PaymentImportsIngestScheduler],
})
export class PaymentImportsModule {}
