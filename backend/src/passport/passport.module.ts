import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PassportController } from './passport.controller';

@Module({
  imports: [AuthModule],
  controllers: [PassportController],
})
export class PassportModule {}
