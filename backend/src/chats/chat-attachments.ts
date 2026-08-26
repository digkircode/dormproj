import { promises as fs } from 'fs';
import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import type { ChatAttachmentKind } from '../../generated/prisma/client.js';
import { attachmentKindForMime, compressImageInPlace, maxBytesForKind } from './chat-attachments-storage';

export interface ValidatedAttachment {
  kind: ChatAttachmentKind;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  storageKey: string;
}

// fileFilter (см. chatAttachmentsMulterOptions) уже отсеивает недопустимые MIME-типы
// при приёме — здесь точный лимит РАЗМЕРА по типу: multer.limits.fileSize — одна общая
// граница на все файлы сразу (нет способа задать её по-разному для фото/видео), поэтому
// она выставлена по видео (see MAX_VIDEO_BYTES), а фото проверяется постфактум. Заодно
// сжимает фото (см. compressImageInPlace) — лимит по размеру проверяется ДО сжатия,
// по оригиналу (не даём протащить туда файл больше заявленного лимита ещё до обработки),
// а sizeBytes в БД — уже итоговый, после сжатия.
export async function validateAttachmentSizes(files: Express.Multer.File[]): Promise<ValidatedAttachment[]> {
  const result: ValidatedAttachment[] = [];
  for (const file of files) {
    const kind = attachmentKindForMime(file.mimetype);
    if (!kind) {
      // Не должно случиться (fileFilter уже отсеял) — защитно, на случай гонки.
      const t = I18nContext.current();
      const mimeType = file.mimetype || t?.t('chat.errors.unknownMimeType') || 'неизвестен';
      throw new BadRequestException(t?.t('chat.errors.invalidFileType', { args: { type: mimeType } }) ?? `Недопустимый тип файла: ${mimeType}`);
    }
    const max = maxBytesForKind(kind);
    if (file.size > max) {
      const maxMb = Math.round(max / (1024 * 1024));
      throw new BadRequestException(
        I18nContext.current()?.t('chat.errors.fileTooLarge', { args: { name: file.originalname, max: maxMb } }) ??
          `Файл «${file.originalname}» превышает допустимый размер (${maxMb} МБ)`,
      );
    }
    let sizeBytes = file.size;
    if (kind === 'IMAGE') {
      const compressedSize = await compressImageInPlace(file.path, file.mimetype);
      if (compressedSize !== null) sizeBytes = compressedSize;
    }
    result.push({ kind, mimeType: file.mimetype, fileName: file.originalname, sizeBytes, storageKey: file.filename });
  }
  return result;
}

// Удаляет уже записанные на диск файлы — вызывается, когда запрос отклоняется ПОСЛЕ
// того, как multer их принял (превышен лимит размера/скорости отправки), чтобы не
// оставлять сиротские файлы на диске.
export async function cleanupUploadedFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}
