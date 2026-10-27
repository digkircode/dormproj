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
import { I18nContext } from 'nestjs-i18n';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { zodErrorMessage } from '../i18n/zod-error-message';
import { ChatEventsService } from './chat-events.service';
import { ChatUploadGuard } from './chat-upload.guard';
import { chatRecipientFacets, chatRecipients, type ChatRecipientFilters } from './chat-recipients';
import { currentResidentAssignments } from '../contracts/resident-assignments';
import { dateOnly } from '../billing/period-utils';
import {
  CHAT_UPLOADS_DIR,
  MAX_ATTACHMENTS_PER_MESSAGE,
  chatAttachmentsMulterOptions,
} from './chat-attachments-storage';
import { attachmentCreateData, cleanupUploadedFiles, validateAttachmentSizes } from './chat-attachments';
import { ChatBroadcastService } from './chat-broadcast.service';
import { isMessageRead } from './chat-read-status';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_BODY_LENGTH = 4000;
export const MESSAGES_PAGE_SIZE = 50;

function attachmentPreviewLabel(attachments: { kind: string }[]): string {
  const t = I18nContext.current();
  if (attachments.length > 1) {
    return t?.t('chat.preview.files', { args: { count: attachments.length } }) ?? `📎 ${attachments.length} файла`;
  }
  return attachments[0].kind === 'VIDEO' ? (t?.t('chat.preview.video') ?? '🎥 Видео') : (t?.t('chat.preview.photo') ?? '📷 Фото');
}

const broadcastSchema = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  floors: z.array(z.string().trim().min(1)).nullish(),
  corpus: z.string().trim().min(1).nullish(),
  debtorsOnly: z.boolean().nullish(),
  search: z.string().trim().min(1).nullish(),
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

function parseCsvParam(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

@Controller('chats')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class ChatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventsService,
    private readonly notifications: NotificationsService,
    private readonly broadcasts: ChatBroadcastService,
  ) {}

  @Get()
  async list() {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { messages: { some: {} } },
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

  @Post('broadcast')
  @UseGuards(ChatUploadGuard)
  @UseInterceptors(FilesInterceptor('files', MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions()))
  async broadcast(
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('body') bodyText: string | undefined,
    @Body('filters') filtersRaw: string | undefined,
    @Body('requestId') requestId: string | undefined,
    @Req() req: Request,
  ) {
    if (!req.user) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }

    let filtersJson: unknown;
    try {
      filtersJson = filtersRaw ? JSON.parse(filtersRaw) : {};
    } catch {
      await cleanupUploadedFiles(files);
      throw new BadRequestException('chat.errors.invalidRecipientFilters');
    }
    const parsed = broadcastSchema.safeParse({ ...(filtersJson as object), body: bodyText, requestId });
    if (!parsed.success) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    const data = parsed.data;

    let accepted = false;
    let creationStarted = false;
    try {
      const previous = await this.broadcasts.findExisting(data.requestId, req.user.id);
      if (previous) {
        await cleanupUploadedFiles(files);
        return this.broadcasts.status(previous.id);
      }
      const baseAttachments = await validateAttachmentSizes(files);
      const recipients = await chatRecipients(this.prisma, toFilters(data));
      if (recipients.length === 0) {
        throw new BadRequestException('chat.errors.noMatchingResidents');
      }
      creationStarted = true;
      const job = await this.broadcasts.create(
        data.requestId, req.user, data.body,
        [...new Set(recipients.map((recipient) => recipient.individualUid))], baseAttachments,
      );
      accepted = true;
      return this.broadcasts.status(job.id);
    } catch (error) {
      if (!accepted && creationStarted) {
        let previous: Awaited<ReturnType<ChatBroadcastService['findExisting']>>;
        try {
          previous = await this.broadcasts.findExisting(data.requestId, req.user.id);
        } catch {
          throw error;
        }
        if (previous) {
          const savedKeys = new Set(previous.files.map((item) => item.file.storageKey));
          await cleanupUploadedFiles(files.filter((file) => !savedKeys.has(file.filename)));
          return this.broadcasts.status(previous.id);
        }
      }
      if (!accepted) await cleanupUploadedFiles(files);
      throw error;
    }
  }

  @Get('broadcasts/:id')
  async broadcastStatus(@Param('id') idParam: string) {
    return this.broadcasts.status(parseId(idParam));
  }

  @Post('broadcasts/:id/retry')
  async retryBroadcast(@Param('id') idParam: string) {
    return this.broadcasts.retry(parseId(idParam));
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.events.events$.pipe(map((event) => ({ data: event })));
  }

  @Get(':id/messages')
  async messages(@Param('id') idParam: string, @Query('before') beforeParam?: string) {
    const conversationId = parseId(idParam);
    const before = beforeParam ? parseId(beforeParam) : undefined;

    const [conversation, rows] = await Promise.all([
      this.prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { staffLastReadAt: true, residentLastReadAt: true },
      }),
      this.prisma.chatMessage.findMany({
        where: { conversationId, ...(before ? { id: { lt: before } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: MESSAGES_PAGE_SIZE + 1,
        include: { sender: { select: { fullName: true } }, attachments: true },
      }),
    ]);

    const hasMore = rows.length > MESSAGES_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, MESSAGES_PAGE_SIZE) : rows;

    return {
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
          unreadByMe: row.senderRole === 'RESIDENT' && (!conversation?.staffLastReadAt || row.createdAt > conversation.staffLastReadAt),
        }))
        .reverse(),
    };
  }

  @Get(':id/resident-info')
  async residentInfo(@Param('id') idParam: string) {
    const conversationId = parseId(idParam);
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { individualUid: true },
    });
    if (!conversation) {
      throw new NotFoundException('chat.errors.conversationNotFound');
    }

    const assignment = (await currentResidentAssignments(this.prisma, dateOnly(new Date()), true, conversation.individualUid))[0];

    return {
      contractId: assignment?.contract.id ?? null,
      contractNumber: assignment?.contract.number ?? null,
      room: assignment?.room.room ?? null,
    };
  }

  @Post(':id/messages')
  @UseGuards(ChatUploadGuard)
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
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const trimmedBody = bodyText?.trim();
    if (trimmedBody && trimmedBody.length > MAX_BODY_LENGTH) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException(
        I18nContext.current()?.t('chat.errors.bodyTooLong', { args: { max: MAX_BODY_LENGTH } }) ??
          `Сообщение слишком длинное (максимум ${MAX_BODY_LENGTH} символов)`,
      );
    }
    if (!trimmedBody && files.length === 0) {
      await cleanupUploadedFiles(files);
      throw new BadRequestException('chat.errors.emptyMessage');
    }

    try {
      const attachments = await validateAttachmentSizes(files);

      const conversation = await this.prisma.chatConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) {
        throw new NotFoundException('chat.errors.conversationNotFound');
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
            attachments: { create: attachmentCreateData(attachments) },
          },
        });
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: now, staffLastReadAt: now },
        });
        await this.notifications.enqueueChat(tx, created.id, conversation.individualUid);
        return { message: created, individualUid: conversation.individualUid };
      });

      this.events.emit({ conversationId, individualUid, messageId: message.id });
      return { id: message.id, createdAt: message.createdAt };
    } catch (error) {
      await cleanupUploadedFiles(files);
      throw error;
    }
  }

  @Get('attachments/:id')
  async attachment(@Param('id') idParam: string, @Res() res: Response) {
    const id = parseId(idParam);
    const attachment = await this.prisma.chatAttachment.findUnique({ where: { id }, include: { file: true } });
    if (!attachment) {
      throw new NotFoundException('chat.errors.fileNotFound');
    }
    const filePath = join(CHAT_UPLOADS_DIR, attachment.file.storageKey);
    if (!existsSync(filePath)) {
      throw new NotFoundException('chat.errors.fileNotFound');
    }
    res.set('Content-Type', attachment.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  }

  @Post(':id/read')
  async markRead(@Param('id') idParam: string) {
    const conversationId = parseId(idParam);
    const existing = await this.prisma.chatConversation.findUnique({ where: { id: conversationId } });
    if (!existing) {
      throw new NotFoundException('chat.errors.conversationNotFound');
    }
    const hasUnread = !existing.staffLastReadAt || existing.lastMessageAt > existing.staffLastReadAt;
    if (!hasUnread) {
      return { ok: true };
    }
    const conversation = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { staffLastReadAt: new Date() },
    });
    this.events.emit({ conversationId, individualUid: conversation.individualUid });
    return { ok: true };
  }
}

function parseId(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('chat.errors.invalidConversationId');
  }
  return id;
}
