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
import { I18nContext } from 'nestjs-i18n';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { currentResidentAssignments } from '../contracts/resident-assignments';
import { dateOnly } from '../billing/period-utils';
import { ensureUserRecord } from '../users/ensure-user';
import { ChatEventsService } from './chat-events.service';
import { ChatRateLimiterService } from './chat-rate-limiter.service';
import { ChatUploadGuard, ResidentMessageRateGuard } from './chat-upload.guard';
import { CHAT_UPLOADS_DIR, MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions } from './chat-attachments-storage';
import { attachmentCreateData, cleanupUploadedFiles, validateAttachmentSizes } from './chat-attachments';
import { isMessageRead } from './chat-read-status';
import { MESSAGES_PAGE_SIZE } from './chats.controller';

const MAX_BODY_LENGTH = 4000;

function parseId(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('contracts.errors.invalidId');
  }
  return id;
}

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
    if (!user?.univerId) {
      throw new BadRequestException('chat.errors.accountNotLinkedToIndividual');
    }
    return user.univerId;
  }

  @Get()
  async myChat(@Req() req: Request, @Query('before') beforeParam?: string) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
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

  @Get('resident-info')
  async residentInfo(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const assignment = (await currentResidentAssignments(this.prisma, dateOnly(new Date()), true, individualUid))[0];
    return {
      contractNumber: assignment?.contract.number ?? null,
      room: assignment?.room.room ?? null,
    };
  }

  @Get('unread')
  async unread(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { individualUid },
      select: { id: true, lastMessageAt: true, residentLastReadAt: true },
    });
    if (!conversation) {
      return { unread: false, count: 0 };
    }
    const unread = !conversation.residentLastReadAt || conversation.lastMessageAt > conversation.residentLastReadAt;
    const count = unread
      ? await this.prisma.chatMessage.count({
          where: {
            conversationId: conversation.id,
            senderRole: 'STAFF',
            ...(conversation.residentLastReadAt ? { createdAt: { gt: conversation.residentLastReadAt } } : {}),
          },
        })
      : 0;
    return { unread, count };
  }

  @Post('messages')
  @UseGuards(ChatUploadGuard, ResidentMessageRateGuard)
  @UseInterceptors(FilesInterceptor('files', MAX_ATTACHMENTS_PER_MESSAGE, chatAttachmentsMulterOptions()))
  async sendMessage(
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('body') bodyText: string | undefined,
    @Req() req: Request,
  ) {
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
      throw new BadRequestException('chat.errors.emptyMessage');
    }

    try {
      this.rateLimiter.checkAndRecordAttachments(req.user.id, files.length);
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
            attachments: { create: attachmentCreateData(attachments) },
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

  @Get('attachments/:id')
  async attachment(@Param('id') idParam: string, @Req() req: Request, @Res() res: Response) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const id = parseId(idParam);

    const attachment = await this.prisma.chatAttachment.findUnique({
      where: { id },
      include: { file: true, message: { include: { conversation: true } } },
    });
    if (!attachment || attachment.message.conversation.individualUid !== individualUid) {
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

  @Sse('stream')
  async stream(@Req() req: Request): Promise<Observable<MessageEvent>> {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    return this.events.events$.pipe(
      filter((event) => event.individualUid === individualUid),
      map((event) => ({ data: event })),
    );
  }
}
