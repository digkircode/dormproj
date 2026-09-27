import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MyNotificationsController, NotificationWebhooksController } from './notifications.controller';

@Module({ providers: [NotificationsService], controllers: [MyNotificationsController, NotificationWebhooksController], exports: [NotificationsService] })
export class NotificationsModule {}
