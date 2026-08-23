import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatsController } from './chats.controller';
import { MyChatController } from './my-chat.controller';
import { ChatEventsService } from './chat-events.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatsController, MyChatController],
  providers: [ChatEventsService],
})
export class ChatsModule {}
