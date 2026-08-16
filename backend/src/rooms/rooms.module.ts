import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsController } from './rooms.controller';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController],
})
export class RoomsModule {}
