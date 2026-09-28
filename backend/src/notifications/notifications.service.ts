import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, type NotificationChannel, type NotificationDelivery } from '../../generated/prisma/client.js';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { announcementNotification, chatNotification, type NotificationText } from './notification-text';

const digestDelay = 5 * 60_000;
const maxDigestDelay = 15 * 60_000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private running = false;
  private pollingTelegram = false;
  private telegramOffset = 0;
  private nextTelegramPollAt = 0;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<Env, true>) {}

  configured(channel: NotificationChannel): boolean {
    return channel === 'TELEGRAM'
      ? !!(this.config.get('TELEGRAM_BOT_TOKEN') && this.config.get('TELEGRAM_BOT_USERNAME') && this.config.get('TELEGRAM_WEBHOOK_SECRET'))
      : !!(this.config.get('MAX_BOT_TOKEN') && this.config.get('MAX_BOT_USERNAME') && this.config.get('MAX_WEBHOOK_SECRET'));
  }

  async status(userId: number) {
    const links = await this.prisma.notificationLink.findMany({ where: { userId } });
    return (['TELEGRAM', 'MAX'] as const).map((channel) => ({
      channel, available: this.configured(channel), connected: links.some((link) => link.channel === channel && link.enabled),
    }));
  }

  async setLocale(userId: number, locale: 'ru' | 'en') {
    await this.prisma.user.updateMany({ where: { id: userId }, data: { notificationLocale: locale } });
  }

  async createLink(userId: number, channel: NotificationChannel): Promise<string> {
    if (!this.configured(channel)) throw new Error('Бот пока не настроен');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.notificationLinkToken.deleteMany({ where: { userId, channel } });
    await this.prisma.notificationLinkToken.create({ data: {
      userId, channel, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 10 * 60_000),
    } });
    const username = channel === 'TELEGRAM' ? this.config.get('TELEGRAM_BOT_USERNAME') : this.config.get('MAX_BOT_USERNAME');
    return channel === 'TELEGRAM' ? `https://t.me/${username}?start=${token}` : `https://max.ru/${username}?start=${token}`;
  }

  async connect(channel: NotificationChannel, token: string, externalId: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token) || !/^-?\d{1,20}$/.test(externalId)) return false;
    return this.prisma.$transaction(async (tx) => {
      const linkToken = await tx.notificationLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!linkToken || linkToken.channel !== channel || linkToken.expiresAt < new Date()) return false;
      const taken = await tx.notificationLink.findUnique({ where: { channel_externalId: { channel, externalId } } });
      if (taken && taken.userId !== linkToken.userId) return false;
      await tx.notificationLink.upsert({
        where: { userId_channel: { userId: linkToken.userId, channel } },
        create: { userId: linkToken.userId, channel, externalId },
        update: { externalId, enabled: true },
      });
      await tx.notificationLinkToken.delete({ where: { id: linkToken.id } });
      return true;
    });
  }

  async handleTelegramUpdate(update: unknown): Promise<void> {
    const message = (update as { message?: { text?: string; chat?: { id?: number; type?: string } } } | null)?.message;
    const match = message?.text?.match(/^\/start\s+([A-Za-z0-9_-]{20,128})$/);
    if (match && message?.chat?.type === 'private' && message.chat.id != null) {
      await this.connect('TELEGRAM', match[1], String(message.chat.id));
    }
  }

  // Production currently has no public HTTPS endpoint. Long polling receives
  // /start links over the outbound Telegram API connection instead.
  @Interval(1000)
  async pollTelegram() {
    if (this.pollingTelegram || Date.now() < this.nextTelegramPollAt || !this.configured('TELEGRAM')) return;
    this.pollingTelegram = true;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.config.get('TELEGRAM_BOT_TOKEN')}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: this.telegramOffset, limit: 100, timeout: 25, allowed_updates: ['message'] }),
        signal: AbortSignal.timeout(35_000),
      });
      const body = await response.json() as { ok?: boolean; result?: Array<{ update_id: number; message?: unknown }> };
      if (!response.ok || !body.ok || !Array.isArray(body.result)) throw new Error(`HTTP ${response.status}`);
      for (const update of body.result) {
        await this.handleTelegramUpdate(update);
        this.telegramOffset = update.update_id + 1;
      }
    } catch {
      this.nextTelegramPollAt = Date.now() + 30_000;
      this.logger.warn('Не удалось получить обновления Telegram; повтор через 30 секунд');
    } finally {
      this.pollingTelegram = false;
    }
  }

  async disconnect(userId: number, channel: NotificationChannel) {
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationLink.deleteMany({ where: { userId, channel } });
      await tx.notificationLinkToken.deleteMany({ where: { userId, channel } });
      await tx.notificationDelivery.updateMany({ where: { userId, channel, status: 'PENDING' }, data: { status: 'SKIPPED' } });
    });
  }

  async enqueueAnnouncement(tx: Prisma.TransactionClient, sourceId: number) {
    const links = await tx.notificationLink.findMany({
      where: { enabled: true, user: { roles: { some: { role: { name: 'RESIDENT' } } } } },
      select: { userId: true, channel: true },
    });
    await tx.notificationDelivery.createMany({
      data: links.map(({ userId, channel }) => ({ userId, channel, kind: 'ANNOUNCEMENT' as const, sourceId, dueAt: new Date() })),
      skipDuplicates: true,
    });
  }

  async enqueueChat(tx: Prisma.TransactionClient, sourceId: number, individualUid: string) {
    const links = await tx.notificationLink.findMany({
      where: { enabled: true, user: { univerId: individualUid, roles: { some: { role: { name: 'RESIDENT' } } } } },
      select: { userId: true, channel: true },
    });
    const now = new Date();
    for (const { userId, channel } of links) {
      const pending = await tx.notificationDelivery.findFirst({
        where: { userId, channel, kind: 'CHAT', status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
      });
      const dueAt = pending ? new Date(Math.min(now.getTime() + digestDelay, pending.createdAt.getTime() + maxDigestDelay))
        : new Date(now.getTime() + digestDelay);
      await tx.notificationDelivery.createMany({
        data: [{ userId, channel, kind: 'CHAT', sourceId, dueAt }], skipDuplicates: true,
      });
      await tx.notificationDelivery.updateMany({
        where: { userId, channel, kind: 'CHAT', status: 'PENDING' }, data: { dueAt },
      });
    }
  }

  private async send(channel: NotificationChannel, externalId: string, notification: NotificationText): Promise<string | null> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: unknown;
    if (channel === 'TELEGRAM') {
      url = `https://api.telegram.org/bot${this.config.get('TELEGRAM_BOT_TOKEN')}/sendMessage`;
      body = { chat_id: externalId, text: notification.telegramHtml, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
    } else {
      url = `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(externalId)}`;
      headers = { ...headers, Authorization: this.config.get('MAX_BOT_TOKEN') ?? '' };
      body = { text: notification.plain };
    }
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const result = await response.json() as { ok?: boolean; result?: { message_id?: number }; message?: { body?: { mid?: string } }; description?: string };
    if (!response.ok || (channel === 'TELEGRAM' && !result.ok)) throw new Error(`HTTP ${response.status}: ${result.description ?? 'Ошибка отправки'}`);
    return channel === 'TELEGRAM' ? String(result.result?.message_id ?? '') : result.message?.body?.mid ?? null;
  }

  private async process(row: NotificationDelivery) {
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: { id: row.id, status: 'PENDING', dueAt: { lte: new Date() } },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    if (!claimed.count) return;
    const candidates = row.kind === 'CHAT' ? await this.prisma.notificationDelivery.findMany({
      where: { userId: row.userId, channel: row.channel, kind: 'CHAT', status: 'PENDING', dueAt: { lte: new Date() } },
      orderBy: { sourceId: 'asc' },
    }) : [];
    const group = candidates.length ? await this.prisma.notificationDelivery.updateManyAndReturn({
      where: { id: { in: candidates.map((item) => item.id) }, status: 'PENDING' }, data: { status: 'PROCESSING' },
    }) : [];
    const groupIds = [row.id, ...group.map((item) => item.id)];
    try {
      const link = await this.prisma.notificationLink.findUnique({ where: { userId_channel: { userId: row.userId, channel: row.channel } } });
      const user = await this.prisma.user.findUnique({ where: { id: row.userId }, include: { roles: { include: { role: true } } } });
      const role = user?.roles.some(({ role }) => role.name === 'RESIDENT');
      if (!link?.enabled || !role) {
        await this.prisma.notificationDelivery.updateMany({ where: { id: { in: groupIds } }, data: { status: 'SKIPPED' } });
        return;
      }
      const base = this.config.get('FRONTEND_URL').replace(/\/$/, '');
      let notification: NotificationText;
      if (row.kind === 'ANNOUNCEMENT') {
        const announcement = await this.prisma.announcement.findUnique({ where: { id: row.sourceId } });
        if (!announcement) {
          await this.prisma.notificationDelivery.update({ where: { id: row.id }, data: { status: 'SKIPPED' } });
          return;
        }
        notification = announcementNotification(announcement.title, announcement.body, `${base}/`, user?.notificationLocale === 'en');
      } else {
        const messages = await this.prisma.chatMessage.findMany({
          where: { id: { in: [row.sourceId, ...group.map((item) => item.sourceId)] }, senderRole: 'STAFF' },
          include: { attachments: { select: { kind: true } }, conversation: { select: { residentLastReadAt: true } } },
          orderBy: { id: 'asc' },
        });
        const unread = messages.filter((message) => !message.conversation.residentLastReadAt || message.createdAt > message.conversation.residentLastReadAt);
        if (!unread.length) {
          await this.prisma.notificationDelivery.updateMany({ where: { id: { in: groupIds } }, data: { status: 'SKIPPED' } });
          return;
        }
        notification = chatNotification(
          unread.map((message) => ({ body: message.body, hasAttachments: message.attachments.length > 0 })),
          `${base}/student/chat`,
          user?.notificationLocale === 'en',
        );
      }
      const providerId = await this.send(row.channel, link.externalId, notification);
      await this.prisma.notificationDelivery.updateMany({ where: { id: { in: groupIds } }, data: { status: 'SENT', providerId } });
    } catch (error) {
      this.logger.warn(`Не удалось отправить уведомление ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      const attempts = row.attempts + 1;
      await this.prisma.notificationDelivery.updateMany({ where: { id: { in: groupIds } }, data: {
        status: attempts >= 8 ? 'FAILED' : 'PENDING',
        dueAt: new Date(Date.now() + Math.min(60 * 60_000, 60_000 * 2 ** attempts)),
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'Ошибка отправки',
      } });
    }
  }

  @Interval(10_000)
  async runQueue() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.notificationDelivery.updateMany({
        where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
        data: { status: 'PENDING' },
      });
      const due = await this.prisma.notificationDelivery.findMany({
        where: { status: 'PENDING', dueAt: { lte: new Date() } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 30,
      });
      for (const row of due) await this.process(row);
    } catch (error) {
      this.logger.error('Ошибка очереди уведомлений', error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
