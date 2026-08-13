import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IndividualsController } from './individuals.controller';

@Module({
  imports: [AuthModule],
  controllers: [IndividualsController],
})
export class IndividualsModule {}
