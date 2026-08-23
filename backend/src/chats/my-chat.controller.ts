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
      include: { sender: { select: { fullName: true } }, attachments: true },
    });

    return {
      conversationId: conversation.id,
      messages: messages.map((row) => ({
        id: row.id,
        body: row.body,
        senderRole: row.senderRole,
        senderFullName: row.sender.fullName,
        createdAt: row.createdAt,
        attachments: row.attachments.map((a) => ({ id: a.id, kind: a.kind, mimeType: a.mimeType, fileName: a.fileName, sizeBytes: a.sizeBytes })),
      })),
    };
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
      const attachments = validateAttachmentSizes(files);
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
