import { existsSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
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
import { CHAT_UPLOADS_DIR, MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions } from './chat-attachments-storage';
import { cleanupUploadedFiles, validateAttachmentSizes } from './chat-attachments';

const MAX_BODY_LENGTH = 4000;

function attachmentPreviewLabel(attachments: { kind: string }[]): string {
  if (attachments.length > 1) return `📎 ${attachments.length} файла`;
  return attachments[0].kind === 'VIDEO' ? '🎥 Видео' : '📷 Фото';
}

const broadcastSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  floors: z.array(z.string().trim().min(1)).nullish(),
  corpus: z.string().trim().min(1).nullish(),
  debtorsOnly: z.boolean().nullish(),
  search: z.string().trim().min(1).nullish(),
  // Явный выбор получателей по ФИО-поиску ("написать 3 конкретным людям") — если задан,
  // остальные фильтры выше игнорируются, см. chatRecipients в chat-recipients.ts.
  individualUids: z.array(z.string().trim().min(1)).nullish(),
});

function toFilters(data: {
  floors?: string[] | null;
  corpus?: string | null;
  debtorsOnly?: boolean | null;
  search?: string | null;
  individualUids?: string[] | null;
}): ChatRecipientFilters {
  return {
    floors: data.floors ?? undefined,
    corpus: data.corpus ?? undefined,
    debtorsOnly: data.debtorsOnly ?? undefined,
    search: data.search ?? undefined,
    individualUids: data.individualUids ?? undefined,
  };
}

// Комбинация из строки "a,b,c" в query-параметре — GET не принимает JSON-массив
// напрямую, POST /broadcast ниже получает floors/individualUids уже настоящим массивом
// в JSON-теле, тут только для превью через query string.
function parseCsvParam(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
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
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { attachments: { select: { kind: true } } } },
      },
    });

    return conversations.map((c) => {
      const last = c.messages[0];
      return {
        id: c.id,
        individualUid: c.individualUid,
        fullName: c.individual.fullName,
        lastMessage: last ? (last.body ?? (last.attachments.length ? attachmentPreviewLabel(last.attachments) : null)) : null,
        lastMessageAt: c.lastMessageAt,
        unread: !c.staffLastReadAt || c.lastMessageAt > c.staffLastReadAt,
      };
    });
  }

  @Get('recipients/filters')
  async recipientFilters() {
    return chatRecipientFacets(this.prisma);
  }

  @Get('recipients')
  async recipients(
    @Query('floors') floorsParam?: string,
    @Query('corpus') corpus?: string,
    @Query('debtorsOnly') debtorsOnly?: string,
    @Query('search') search?: string,
    @Query('individualUids') individualUidsParam?: string,
  ) {
    return chatRecipients(this.prisma, {
      floors: parseCsvParam(floorsParam),
      corpus,
      debtorsOnly: debtorsOnly === 'true',
      search,
      individualUids: parseCsvParam(individualUidsParam),
    });
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
      include: { sender: { select: { fullName: true } }, attachments: true },
    });

    return rows
      .map((row) => ({
        id: row.id,
        body: row.body,
        senderRole: row.senderRole,
        senderFullName: row.sender.fullName,
        createdAt: row.createdAt,
        attachments: row.attachments.map((a) => ({ id: a.id, kind: a.kind, mimeType: a.mimeType, fileName: a.fileName, sizeBytes: a.sizeBytes })),
      }))
      .reverse();
  }

  @Post(':id/messages')
  @UseInterceptors(FilesInterceptor('files', MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions()))
  async sendMessage(
    @Param('id') idParam: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('body') bodyText: string | undefined,
    @Req() req: Request,
  ) {
    const conversationId = parseId(idParam);
    if (!req.user) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const trimmedBody = bodyText?.trim();
    if (trimmedBody && trimmedBody.length > MAX_BODY_LENGTH) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException(`Сообщение слишком длинное (максимум ${MAX_BODY_LENGTH} символов)`);
    }
    if (!trimmedBody && files.length === 0) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException('Пустое сообщение — добавьте текст или файл');
    }

    // Всё, что может упасть ПОСЛЕ того, как multer уже записал файлы на диск — одним
    // try/catch, чтобы ни один путь отказа не оставлял сиротские файлы (тот же приём,
    // что в my-chat.controller.ts).
    try {
      const attachments = validateAttachmentSizes(files);

      const conversation = await this.prisma.chatConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) {
        throw new NotFoundException('Диалог не найден');
      }

      const now = new Date();
      const { message, individualUid } = await this.prisma.$transaction(async (tx) => {
        const userId = await ensureUserRecord(tx, req.user!);
        const created = await tx.chatMessage.create({
          data: {
            conversationId,
            senderUserId: userId,
            senderRole: 'STAFF',
            body: trimmedBody || null,
            attachments: { create: attachments },
          },
        });
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: now, staffLastReadAt: now },
        });
        return { message: created, individualUid: conversation.individualUid };
      });

      this.events.emit({ conversationId, individualUid, messageId: message.id });
      return { id: message.id, createdAt: message.createdAt };
    } catch (error) {
      await cleanupUploadedFiles(files);
      throw error;
    }
  }

  // Доступ сотрудникам — к любому вложению (весь контроллер уже STAFF/ADMIN-only,
  // отдельная проверка "своего" диалога, как в MyChatController, здесь не нужна).
  @Get('attachments/:id')
  async attachment(@Param('id') idParam: string, @Res() res: Response) {
    const id = parseId(idParam);
    const attachment = await this.prisma.chatAttachment.findUnique({ where: { id } });
    if (!attachment) {
      throw new NotFoundException('Файл не найден');
    }
    const filePath = join(CHAT_UPLOADS_DIR, attachment.storageKey);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Файл не найден');
    }
    res.set('Content-Type', attachment.mimeType);
    res.sendFile(filePath);
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
