import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ACQUIRING_PROVIDER } from './acquiring.types';
import { GazprombankAcquiringProvider } from './gazprombank-acquiring.provider';

@Module({
  imports: [HttpModule],
  providers: [{ provide: ACQUIRING_PROVIDER, useClass: GazprombankAcquiringProvider }],
  exports: [ACQUIRING_PROVIDER],
})
export class AcquiringModule {}
