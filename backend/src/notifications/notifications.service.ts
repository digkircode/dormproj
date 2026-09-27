import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, type NotificationChannel, type NotificationDelivery } from '../../generated/prisma/client.js';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

const digestDelay = 5 * 60_000;
const maxDigestDelay = 15 * 60_000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private running = false;

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

  private async send(channel: NotificationChannel, externalId: string, text: string): Promise<string | null> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: unknown;
    if (channel === 'TELEGRAM') {
      url = `https://api.telegram.org/bot${this.config.get('TELEGRAM_BOT_TOKEN')}/sendMessage`;
      body = { chat_id: externalId, text };
    } else {
      url = `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(externalId)}`;
      headers = { ...headers, Authorization: this.config.get('MAX_BOT_TOKEN') ?? '' };
      body = { text };
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
      let text: string;
      if (row.kind === 'ANNOUNCEMENT') {
        const announcement = await this.prisma.announcement.findUnique({ where: { id: row.sourceId } });
        if (!announcement) {
          await this.prisma.notificationDelivery.update({ where: { id: row.id }, data: { status: 'SKIPPED' } });
          return;
        }
        text = user?.notificationLocale === 'en'
          ? `New announcement: ${announcement.title}\n\n${announcement.body}\n\n${base}/`
          : `Новое объявление: ${announcement.title}\n\n${announcement.body}\n\n${base}/`;
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
        const en = user?.notificationLocale === 'en';
        const shown = unread.slice(-3).map((message) => message.body || message.attachments.map((a) => a.kind === 'VIDEO' ? (en ? 'Video' : 'Видео') : (en ? 'Photo' : 'Фото')).join(', '));
        text = en
          ? `Messages from staff:\n${shown.join('\n\n')}${unread.length > 3 ? `\n\nAnd ${unread.length - 3} more messages` : ''}\n\n${base}/student/chat`
          : `Сообщения администрации:\n${shown.join('\n\n')}${unread.length > 3 ? `\n\nИ ещё ${unread.length - 3} сообщений` : ''}\n\n${base}/student/chat`;
      }
      const url = row.kind === 'CHAT' ? `${base}/student/chat` : `${base}/`;
      const providerId = await this.send(row.channel, link.externalId, text.length > 3900 ? `${text.slice(0, 3800)}…\n\n${url}` : text);
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
