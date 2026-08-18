import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractsController } from './contracts.controller';

@Module({
  imports: [AuthModule],
  controllers: [ContractsController],
})
export class ContractsModule {}
