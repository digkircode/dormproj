import { promises as fs } from 'fs';
import { BadRequestException } from '@nestjs/common';
import type { ChatAttachmentKind } from '../../generated/prisma/client.js';
import { attachmentKindForMime, maxBytesForKind } from './chat-attachments-storage';

export interface ValidatedAttachment {
  kind: ChatAttachmentKind;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  storageKey: string;
}

// fileFilter (см. chatAttachmentsMulterOptions) уже отсеивает недопустимые MIME-типы
// при приёме — здесь только точный лимит РАЗМЕРА по типу: multer.limits.fileSize — одна
// общая граница на все файлы сразу (нет способа задать её по-разному для фото/видео),
// поэтому она выставлена по видео (see MAX_VIDEO_BYTES), а фото проверяется постфактум.
export function validateAttachmentSizes(files: Express.Multer.File[]): ValidatedAttachment[] {
  return files.map((file) => {
    const kind = attachmentKindForMime(file.mimetype);
    if (!kind) {
      // Не должно случиться (fileFilter уже отсеял) — защитно, на случай гонки.
      throw new BadRequestException(`Недопустимый тип файла: ${file.mimetype || 'неизвестен'}`);
    }
    const max = maxBytesForKind(kind);
    if (file.size > max) {
      throw new BadRequestException(`Файл «${file.originalname}» превышает допустимый размер (${Math.round(max / (1024 * 1024))} МБ)`);
    }
    return { kind, mimeType: file.mimetype, fileName: file.originalname, sizeBytes: file.size, storageKey: file.filename };
  });
}

// Удаляет уже записанные на диск файлы — вызывается, когда запрос отклоняется ПОСЛЕ
// того, как multer их принял (превышен лимит размера/скорости отправки), чтобы не
// оставлять сиротские файлы на диске.
export async function cleanupUploadedFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}
