import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnnouncementsController } from './announcements.controller';
import { MyAnnouncementsController } from './my-announcements.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AnnouncementsController, MyAnnouncementsController],
})
export class AnnouncementsModule {}
