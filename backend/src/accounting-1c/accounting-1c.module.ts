import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ACCOUNTING_1C_PROVIDER } from './accounting-1c.types';
import { Accounting1cPaymentsProvider } from './accounting-1c-payments.provider';

@Module({
  imports: [HttpModule],
  providers: [{ provide: ACCOUNTING_1C_PROVIDER, useClass: Accounting1cPaymentsProvider }],
  exports: [ACCOUNTING_1C_PROVIDER],
})
export class Accounting1cModule {}
