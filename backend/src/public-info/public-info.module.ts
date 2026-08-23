import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicInfoController } from './public-info.controller';

@Module({
  imports: [AuthModule],
  controllers: [PublicInfoController],
})
export class PublicInfoModule {}
