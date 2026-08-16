import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomCharacteristicDefinitionsController } from './room-characteristic-definitions.controller';

@Module({
  imports: [AuthModule],
  controllers: [RoomCharacteristicDefinitionsController],
})
export class RoomCharacteristicDefinitionsModule {}
