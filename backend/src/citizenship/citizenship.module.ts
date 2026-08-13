import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitizenshipController } from './citizenship.controller';

@Module({
  imports: [AuthModule],
  controllers: [CitizenshipController],
})
export class CitizenshipModule {}
