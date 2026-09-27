import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { NotificationChannel } from '../../generated/prisma/client.js';
import type { Env } from '../config/env.schema';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService } from './notifications.service';

function channelParam(value: string): NotificationChannel {
  if (value !== 'TELEGRAM' && value !== 'MAX') throw new BadRequestException('Неизвестный канал');
  return value;
}

function equalSecret(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('my-notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MyNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  status(@Req() req: Request) { return this.notifications.status(req.user!.id); }

  @Patch('locale')
  async locale(@Req() req: Request, @Body() body: { locale?: string }) {
    if (body?.locale !== 'ru' && body?.locale !== 'en') throw new BadRequestException('Unsupported locale');
    await this.notifications.setLocale(req.user!.id, body.locale);
    return { ok: true };
  }

  @Post(':channel/link')
  async link(@Param('channel') raw: string, @Req() req: Request) {
    const channel = channelParam(raw);
    try { return { url: await this.notifications.createLink(req.user!.id, channel) }; }
    catch { throw new BadRequestException('Этот бот пока не настроен'); }
  }

  @Delete(':channel')
  async disconnect(@Param('channel') raw: string, @Req() req: Request) {
    await this.notifications.disconnect(req.user!.id, channelParam(raw));
    return { ok: true };
  }
}

@Controller('notification-webhooks')
export class NotificationWebhooksController {
  constructor(private readonly notifications: NotificationsService, private readonly config: ConfigService<Env, true>) {}

  @Post('telegram')
  async telegram(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: unknown) {
    if (!equalSecret(secret, this.config.get('TELEGRAM_WEBHOOK_SECRET'))) throw new ForbiddenException();
    await this.notifications.handleTelegramUpdate(body);
    return { ok: true };
  }

  @Post('max')
  async max(@Headers('x-max-bot-api-secret') secret: string | undefined, @Body() body: unknown) {
    if (!equalSecret(secret, this.config.get('MAX_WEBHOOK_SECRET'))) throw new ForbiddenException();
    const update = body as { update_type?: string; payload?: string; user?: { user_id?: number }; chat_id?: number };
    if (update?.update_type === 'bot_started' && update.payload && update.user?.user_id != null) {
      await this.notifications.connect('MAX', update.payload, String(update.user.user_id));
    }
    return { ok: true };
  }
}
