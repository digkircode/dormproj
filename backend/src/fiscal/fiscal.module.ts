import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FISCAL_PROVIDER } from './fiscal.types';
import { AtolFiscalProvider } from './atol-fiscal.provider';

@Module({
  imports: [HttpModule],
  providers: [{ provide: FISCAL_PROVIDER, useClass: AtolFiscalProvider }],
  exports: [FISCAL_PROVIDER],
})
export class FiscalModule {}
