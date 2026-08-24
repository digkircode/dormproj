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
import { filter, map } from 'rxjs/operators';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { ChatEventsService } from './chat-events.service';
import { ChatRateLimiterService } from './chat-rate-limiter.service';
import { CHAT_UPLOADS_DIR, MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions } from './chat-attachments-storage';
import { cleanupUploadedFiles, validateAttachmentSizes } from './chat-attachments';
import { isMessageRead } from './chat-read-status';
import { MESSAGES_PAGE_SIZE } from './chats.controller';

const MAX_BODY_LENGTH = 4000;

function parseId(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

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
    private readonly rateLimiter: ChatRateLimiterService,
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

  // Открытие своего чата = прочтение — бампает residentLastReadAt, отдельного
  // POST /my-chat/read поэтому нет (был бы мёртвым кодом). Но ТОЛЬКО на первой странице
  // (before не задан) — подгрузка истории по скроллу вверх (see ChatThread.vue) не
  // должна каждый раз заново помечать диалог прочитанным. НЕ заводит диалог сам по себе,
  // если его ещё нет (см. GET /my-chat/unread — тот же принцип) — раньше заводил через
  // upsert, из-за чего у сотрудников появлялись "диалоги" от людей, которые просто
  // открыли вкладку, ничего не написав (по прямой просьбе исправлено).
  // unreadByMe считается по residentLastReadAt ДО бампа выше — снимок "что было
  // непрочитано на момент открытия", тем же приёмом, что в ChatsController.
  @Get()
  async myChat(@Req() req: Request, @Query('before') beforeParam?: string) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const before = beforeParam ? parseId(beforeParam) : undefined;

    const existing = await this.prisma.chatConversation.findUnique({ where: { individualUid } });
    if (!existing) {
      return { conversationId: null, hasMore: false, messages: [] };
    }

    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId: existing.id, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: MESSAGES_PAGE_SIZE + 1,
      include: { sender: { select: { fullName: true } }, attachments: true },
    });
    const hasMore = rows.length > MESSAGES_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, MESSAGES_PAGE_SIZE) : rows;

    // Бамп/эмит — ТОЛЬКО на первой странице (before не задан, не на каждой подгрузке
    // истории по скроллу вверх) И только если реально было что читать — тот же guard,
    // что в chats.controller.ts#markRead, той же причины ради: без него это был бы
    // бесконечный пинг-понг SSE-событий между обеими открытыми в реальном времени
    // сторонами одного диалога (каждая сторона рефетчит по чужому событию, попутно сама
    // бампает и эмитит уже своё).
    const hasUnreadForResident = !existing.residentLastReadAt || existing.lastMessageAt > existing.residentLastReadAt;
    const shouldMarkRead = !before && hasUnreadForResident;
    const conversation = shouldMarkRead
      ? await this.prisma.chatConversation.update({ where: { id: existing.id }, data: { residentLastReadAt: new Date() } })
      : existing;
    if (shouldMarkRead) {
      this.events.emit({ conversationId: existing.id, individualUid });
    }

    return {
      conversationId: existing.id,
      hasMore,
      messages: page
        .map((row) => ({
          id: row.id,
          body: row.body,
          senderRole: row.senderRole,
          senderFullName: row.sender.fullName,
          createdAt: row.createdAt,
          attachments: row.attachments.map((a) => ({ id: a.id, kind: a.kind, mimeType: a.mimeType, fileName: a.fileName, sizeBytes: a.sizeBytes })),
          read: isMessageRead(row.senderRole, row.createdAt, conversation),
          unreadByMe: row.senderRole === 'STAFF' && (!existing.residentLastReadAt || row.createdAt > existing.residentLastReadAt),
        }))
        .reverse(),
    };
  }

  // Лёгкая проверка "есть ли непрочитанное", БЕЗ побочного эффекта пометки прочтения
  // (в отличие от GET / выше) — нужна для бейджика в сайдбаре (AppSidebar.vue), который
  // может дёргаться, когда пользователь вообще не на странице чата; вызов обычного GET /
  // оттуда сразу пометил бы всё прочитанным, и бейджик не успевал бы показаться.
  @Get('unread')
  async unread(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { individualUid },
      select: { lastMessageAt: true, residentLastReadAt: true },
    });
    if (!conversation) {
      return { unread: false };
    }
    return { unread: !conversation.residentLastReadAt || conversation.lastMessageAt > conversation.residentLastReadAt };
  }

  @Post('messages')
  @UseInterceptors(FilesInterceptor('files', MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions()))
  async sendMessage(
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('body') bodyText: string | undefined,
    @Req() req: Request,
  ) {
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
      throw new BadRequestException('Пустое сообщение — добавьте текст или файл');
    }

    // Всё, что может упасть ПОСЛЕ того, как multer уже записал файлы на диск —
    // одним try/catch, чтобы ни один путь отказа (лимит скорости, размер, аккаунт без
    // физлица, ошибка транзакции) не оставлял сиротские файлы.
    try {
      this.rateLimiter.checkAndRecord(req.user.id, files.length);
      const attachments = await validateAttachmentSizes(files);
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
          data: {
            conversationId: conversation.id,
            senderUserId: userId,
            senderRole: 'RESIDENT',
            body: trimmedBody || null,
            attachments: { create: attachments },
          },
        });
        return { message: created, conversationId: conversation.id };
      });

      this.events.emit({ conversationId, individualUid, messageId: message.id });
      return { id: message.id, createdAt: message.createdAt };
    } catch (error) {
      await cleanupUploadedFiles(files);
      throw error;
    }
  }

  // Доступ — только к вложениям СВОЕГО диалога (в отличие от ChatsController, где
  // сотрудник видит любые — там доступ уже ограничен ролью на весь контроллер).
  @Get('attachments/:id')
  async attachment(@Param('id') idParam: string, @Req() req: Request, @Res() res: Response) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const id = parseId(idParam);

    const attachment = await this.prisma.chatAttachment.findUnique({
      where: { id },
      include: { message: { include: { conversation: true } } },
    });
    if (!attachment || attachment.message.conversation.individualUid !== individualUid) {
      throw new NotFoundException('Файл не найден');
    }

    const filePath = join(CHAT_UPLOADS_DIR, attachment.storageKey);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Файл не найден');
    }
    res.set('Content-Type', attachment.mimeType);
    res.sendFile(filePath);
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
