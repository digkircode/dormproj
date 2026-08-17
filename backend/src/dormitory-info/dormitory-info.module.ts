import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DormitoryInfoController } from './dormitory-info.controller';

@Module({
  imports: [AuthModule],
  controllers: [DormitoryInfoController],
})
export class DormitoryInfoModule {}
