import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnnouncementsController } from './announcements.controller';
import { MyAnnouncementsController } from './my-announcements.controller';

@Module({
  imports: [AuthModule],
  controllers: [AnnouncementsController, MyAnnouncementsController],
})
export class AnnouncementsModule {}
