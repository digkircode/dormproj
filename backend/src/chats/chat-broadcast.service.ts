import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import type { SessionUser } from '../auth/types';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatEventsService } from './chat-events.service';
import type { ValidatedAttachment } from './chat-attachments';

const BATCH_SIZE = 25;

@Injectable()
export class ChatBroadcastService {
  private readonly logger = new Logger(ChatBroadcastService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: ChatEventsService,
  ) {}

  async findExisting(requestId: string, senderUserId: number) {
    return this.prisma.chatBroadcast.findFirst({
      where: { requestId, senderUserId },
      select: { id: true, files: { select: { file: { select: { storageKey: true } } } } },
    });
  }

  async create(
    requestId: string,
    sender: SessionUser,
    body: string,
    individualUids: string[],
    files: ValidatedAttachment[],
  ): Promise<{ id: number }> {
    return this.prisma.$transaction(async (tx) => {
      const senderUserId = await ensureUserRecord(tx, sender);
      const job = await tx.chatBroadcast.create({
        data: {
          requestId,
          senderUserId,
          body,
          files: { create: files.map(({ storageKey, ...metadata }) => ({
            ...metadata,
            file: { create: { storageKey } },
          })) },
        },
        select: { id: true },
      });
      await tx.chatBroadcastRecipient.createMany({
        data: individualUids.map((individualUid) => ({ broadcastId: job.id, individualUid })),
        skipDuplicates: true,
      });
      return job;
    }, { timeout: 30_000 });
  }

  async status(id: number) {
    const job = await this.prisma.chatBroadcast.findUnique({ where: { id }, select: { id: true, createdAt: true } });
    if (!job) throw new NotFoundException('chat.errors.broadcastNotFound');
    const counts = await this.prisma.chatBroadcastRecipient.groupBy({
      by: ['status'], where: { broadcastId: id }, _count: { _all: true },
    });
    const count = (status: 'PENDING' | 'SENT' | 'FAILED') => counts.find((item) => item.status === status)?._count._all ?? 0;
    const pending = count('PENDING');
    const sent = count('SENT');
    const failed = count('FAILED');
    return {
      id: job.id,
      createdAt: job.createdAt,
      total: pending + sent + failed,
      pending,
      sent,
      failed,
      status: pending > 0 ? 'RUNNING' : failed > 0 ? 'PARTIAL' : 'COMPLETED',
    };
  }

  async retry(id: number) {
    const job = await this.prisma.chatBroadcast.findUnique({ where: { id }, select: { id: true } });
    if (!job) throw new NotFoundException('chat.errors.broadcastNotFound');
    await this.prisma.chatBroadcastRecipient.updateMany({
      where: { broadcastId: id, status: 'FAILED' },
      data: { status: 'PENDING', lastError: null },
    });
    return this.status(id);
  }

  private async deliver(recipientId: number): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.chatBroadcastRecipient.updateMany({
        where: { id: recipientId, status: 'PENDING' },
        data: { attempts: { increment: 1 } },
      });
      if (!claimed.count) return null;
      const recipient = await tx.chatBroadcastRecipient.findUniqueOrThrow({
        where: { id: recipientId },
        include: { broadcast: { include: { files: true } } },
      });
      if (recipient.messageId !== null) {
        throw new Error(`У получателя ${recipient.id} уже есть сообщение`);
      }
      const now = new Date();
      const conversation = await tx.chatConversation.upsert({
        where: { individualUid: recipient.individualUid },
        create: { individualUid: recipient.individualUid, lastMessageAt: now, staffLastReadAt: now },
        update: { lastMessageAt: now, staffLastReadAt: now },
      });
      const message = await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: recipient.broadcast.senderUserId,
          senderRole: 'STAFF',
          body: recipient.broadcast.body,
          attachments: { create: recipient.broadcast.files.map(({ fileId, kind, mimeType, fileName, sizeBytes }) => ({
            fileId, kind, mimeType, fileName, sizeBytes,
          })) },
        },
      });
      await this.notifications.enqueueChat(tx, message.id, recipient.individualUid);
      await tx.chatBroadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: 'SENT', messageId: message.id, lastError: null },
      });
      return { conversationId: conversation.id, individualUid: recipient.individualUid, messageId: message.id };
    }, { timeout: 15_000 });
    if (result) this.events.emit(result);
  }

  @Interval(1000)
  async runPending() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.chatBroadcastRecipient.findMany({
        where: { status: 'PENDING' }, orderBy: { id: 'asc' }, take: BATCH_SIZE, select: { id: true },
      });
      for (const { id } of pending) {
        try {
          await this.deliver(id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Рассылка: получатель ${id}: ${message}`);
          await this.prisma.chatBroadcastRecipient.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: 'FAILED', attempts: { increment: 1 }, lastError: message.slice(0, 500) },
          });
        }
      }
    } catch (error) {
      this.logger.error('Ошибка обработки рассылки', error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
