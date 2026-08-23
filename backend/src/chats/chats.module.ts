import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatsController } from './chats.controller';
import { MyChatController } from './my-chat.controller';
import { ChatEventsService } from './chat-events.service';
import { ChatRateLimiterService } from './chat-rate-limiter.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatsController, MyChatController],
  providers: [ChatEventsService, ChatRateLimiterService],
})
export class ChatsModule {}
