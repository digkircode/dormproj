import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractsController } from './contracts.controller';
import { MyContractController } from './my-contract.controller';
import { Accounting1cModule } from '../accounting-1c/accounting-1c.module';
import { ContractApprovalService } from './contract-approval.service';

@Module({
  imports: [AuthModule, Accounting1cModule],
  controllers: [ContractsController, MyContractController],
  providers: [ContractApprovalService],
})
export class ContractsModule {}
