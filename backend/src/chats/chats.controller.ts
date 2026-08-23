import { BadRequestException, Body, Controller, Get, MessageEvent, NotFoundException, Param, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { ChatEventsService } from './chat-events.service';
import { chatRecipientFacets, chatRecipients, type ChatRecipientFilters } from './chat-recipients';

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

const broadcastSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  floor: z.string().trim().min(1).nullish(),
  corpus: z.string().trim().min(1).nullish(),
  debtorsOnly: z.boolean().nullish(),
  search: z.string().trim().min(1).nullish(),
});

function toFilters(data: { floor?: string | null; corpus?: string | null; debtorsOnly?: boolean | null; search?: string | null }): ChatRecipientFilters {
  return {
    floor: data.floor ?? undefined,
    corpus: data.corpus ?? undefined,
    debtorsOnly: data.debtorsOnly ?? undefined,
    search: data.search ?? undefined,
  };
}

// Инбокс сотрудников — один диалог на проживающего (Individual), общий сразу для всех
// сотрудников (нет назначения ответственного, см. промпт проекта). Упрощённая переписка
// по типу Telegram, не тикет-система — без приоритетов/статусов/доп. полей.
@Controller('chats')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class ChatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventsService,
  ) {}

  @Get()
  async list() {
    const conversations = await this.prisma.chatConversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      include: {
        individual: { select: { fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      individualUid: c.individualUid,
      fullName: c.individual.fullName,
      lastMessage: c.messages[0]?.body ?? null,
      lastMessageAt: c.lastMessageAt,
      unread: !c.staffLastReadAt || c.lastMessageAt > c.staffLastReadAt,
    }));
  }

  @Get('recipients/filters')
  async recipientFilters() {
    return chatRecipientFacets(this.prisma);
  }

  @Get('recipients')
  async recipients(
    @Query('floor') floor?: string,
    @Query('corpus') corpus?: string,
    @Query('debtorsOnly') debtorsOnly?: string,
    @Query('search') search?: string,
  ) {
    return chatRecipients(this.prisma, { floor, corpus, debtorsOnly: debtorsOnly === 'true', search });
  }

  // Сервер сам пересчитывает получателей по фильтрам на момент отправки (не доверяет
  // списку uid от клиента) — превью в диалоге и реальная рассылка используют одну и ту
  // же функцию chatRecipients, поэтому не могут разойтись.
  @Post('broadcast')
  async broadcast(@Body() body: unknown, @Req() req: Request) {
    const parsed = broadcastSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }

    const data = parsed.data;
    const recipients = await chatRecipients(this.prisma, toFilters(data));
    if (recipients.length === 0) {
      throw new BadRequestException('Нет проживающих, подходящих под выбранные фильтры');
    }

    const now = new Date();
    const results = await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      const created: { conversationId: number; individualUid: string; messageId: number }[] = [];

      for (const recipient of recipients) {
        const conversation = await tx.chatConversation.upsert({
          where: { individualUid: recipient.individualUid },
          create: { individualUid: recipient.individualUid, lastMessageAt: now, staffLastReadAt: now },
          update: { lastMessageAt: now, staffLastReadAt: now },
        });
        const message = await tx.chatMessage.create({
          data: { conversationId: conversation.id, senderUserId: userId, senderRole: 'STAFF', body: data.body },
        });
        created.push({ conversationId: conversation.id, individualUid: recipient.individualUid, messageId: message.id });
      }

      return created;
    });

    for (const result of results) {
      this.events.emit(result);
    }

    return { sentCount: results.length };
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.events.events$.pipe(map((event) => ({ data: event })));
  }

  @Get(':id/messages')
  async messages(@Param('id') idParam: string, @Query('before') beforeParam?: string) {
    const conversationId = parseId(idParam);
    const before = beforeParam ? parseId(beforeParam) : undefined;

    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sender: { select: { fullName: true } } },
    });

    return rows
      .map((row) => ({
        id: row.id,
        body: row.body,
        senderRole: row.senderRole,
        senderFullName: row.sender.fullName,
        createdAt: row.createdAt,
      }))
      .reverse();
  }

  @Post(':id/messages')
  async sendMessage(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const conversationId = parseId(idParam);
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }

    const conversation = await this.prisma.chatConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Диалог не найден');
    }

    const now = new Date();
    const { message, individualUid } = await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      const created = await tx.chatMessage.create({
        data: { conversationId, senderUserId: userId, senderRole: 'STAFF', body: parsed.data.body },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now, staffLastReadAt: now },
      });
      return { message: created, individualUid: conversation.individualUid };
    });

    this.events.emit({ conversationId, individualUid, messageId: message.id });
    return { id: message.id, createdAt: message.createdAt };
  }

  @Post(':id/read')
  async markRead(@Param('id') idParam: string) {
    const conversationId = parseId(idParam);
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { staffLastReadAt: new Date() },
    });
    return { ok: true };
  }
}

function parseId(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id диалога');
  }
  return id;
}
