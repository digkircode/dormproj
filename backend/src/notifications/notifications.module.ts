import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { MyNotificationsController, NotificationWebhooksController } from './notifications.controller';

@Module({ imports: [AuthModule], providers: [NotificationsService], controllers: [MyNotificationsController, NotificationWebhooksController], exports: [NotificationsService] })
export class NotificationsModule {}
