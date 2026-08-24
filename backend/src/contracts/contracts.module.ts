import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractsController } from './contracts.controller';
import { MyContractController } from './my-contract.controller';

@Module({
  imports: [AuthModule],
  controllers: [ContractsController, MyContractController],
})
export class ContractsModule {}
