import { BadRequestException, Body, Controller, Get, MessageEvent, Post, Req, Sse, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { ChatEventsService } from './chat-events.service';

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

// Личный чат проживающего с сотрудниками — ровно один диалог на аккаунт (по ТЗ "между
// проживающими чата нет", см. промпт проекта). Доступ — только роль RESIDENT (не всем
// залогиненным, как остальной раздел "Проживающий" — уточнено с пользователем отдельно).
@Controller('my-chat')
@UseGuards(AuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MyChatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventsService,
  ) {}

  private async resolveIndividualUid(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { univerId: true } });
    // Роль RESIDENT выдаётся только вместе с валидным univerId, совпадающим со Student
    // (см. resident-role-sync.ts) — аккаунт без привязки к физлицу эту роль получить не
    // может, поэтому это защитная проверка на непредвиденное рассинхронизированное состояние.
    if (!user?.univerId) {
      throw new BadRequestException('Аккаунт не привязан к физическому лицу — чат недоступен');
    }
    return user.univerId;
  }

  // Открытие своего чата = прочтение — бампает residentLastReadAt при каждом вызове,
  // отдельного POST /my-chat/read поэтому нет (был бы мёртвым кодом, фронт всегда
  // получает актуальный список сообщений именно через этот эндпоинт).
  @Get()
  async myChat(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const now = new Date();

    const conversation = await this.prisma.chatConversation.upsert({
      where: { individualUid },
      create: { individualUid, lastMessageAt: now, residentLastReadAt: now },
      update: { residentLastReadAt: now },
    });

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { fullName: true } } },
    });

    return {
      conversationId: conversation.id,
      messages: messages.map((row) => ({
        id: row.id,
        body: row.body,
        senderRole: row.senderRole,
        senderFullName: row.sender.fullName,
        createdAt: row.createdAt,
      })),
    };
  }

  @Post('messages')
  async sendMessage(@Body() body: unknown, @Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const now = new Date();

    const { message, conversationId } = await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      const conversation = await tx.chatConversation.upsert({
        where: { individualUid },
        create: { individualUid, lastMessageAt: now, residentLastReadAt: now },
        update: { lastMessageAt: now, residentLastReadAt: now },
      });
      const created = await tx.chatMessage.create({
        data: { conversationId: conversation.id, senderUserId: userId, senderRole: 'RESIDENT', body: parsed.data.body },
      });
      return { message: created, conversationId: conversation.id };
    });

    this.events.emit({ conversationId, individualUid, messageId: message.id });
    return { id: message.id, createdAt: message.createdAt };
  }

  @Sse('stream')
  async stream(@Req() req: Request): Promise<Observable<MessageEvent>> {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    return this.events.events$.pipe(
      filter((event) => event.individualUid === individualUid),
      map((event) => ({ data: event })),
    );
  }
}
