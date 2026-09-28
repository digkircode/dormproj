import { promises as fs } from 'fs';
import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import sharp from 'sharp';
import type { ChatAttachmentKind } from '../../generated/prisma/client.js';
import { attachmentKindForMime, compressImageInPlace, maxBytesForKind, MAX_TOTAL_ATTACHMENT_BYTES } from './chat-attachments-storage';

export interface ValidatedAttachment {
  kind: ChatAttachmentKind;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  storageKey: string;
}

export function attachmentCreateData(attachments: ValidatedAttachment[]) {
  return attachments.map(({ storageKey, ...metadata }) => ({
    ...metadata,
    file: { create: { storageKey } },
  }));
}

// fileFilter (см. chatAttachmentsMulterOptions) уже отсеивает недопустимые MIME-типы
// при приёме — здесь точный лимит РАЗМЕРА по типу: multer.limits.fileSize — одна общая
// граница на все файлы сразу (нет способа задать её по-разному для фото/видео), поэтому
// она выставлена по видео (see MAX_VIDEO_BYTES), а фото проверяется постфактум. Заодно
// сжимает фото (см. compressImageInPlace) — лимит по размеру проверяется ДО сжатия,
// по оригиналу (не даём протащить туда файл больше заявленного лимита ещё до обработки),
// а sizeBytes в БД — уже итоговый, после сжатия.
export async function validateAttachmentSizes(files: Express.Multer.File[]): Promise<ValidatedAttachment[]> {
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new BadRequestException('chat.errors.totalFilesTooLarge');
  }
  const { fileTypeFromFile } = await import('file-type');
  const result: ValidatedAttachment[] = [];
  for (const file of files) {
    const detected = await fileTypeFromFile(file.path);
    const kind = detected && attachmentKindForMime(detected.mime);
    if (!kind || kind !== attachmentKindForMime(file.mimetype)) {
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
    if (kind === 'IMAGE') {
      try {
        const metadata = await sharp(file.path).metadata();
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000 || (metadata.pages ?? 1) > 300) {
          throw new Error('Image dimensions exceeded');
        }
      } catch {
        throw new BadRequestException('chat.errors.invalidFileContent');
      }
    }
    let sizeBytes = file.size;
    if (kind === 'IMAGE') {
      const compressedSize = await compressImageInPlace(file.path, detected.mime);
      if (compressedSize !== null) sizeBytes = compressedSize;
    }
    result.push({ kind, mimeType: detected.mime, fileName: file.originalname, sizeBytes, storageKey: file.filename });
  }
  return result;
}

// Удаляет уже записанные на диск файлы — вызывается, когда запрос отклоняется ПОСЛЕ
// того, как multer их принял (превышен лимит размера/скорости отправки), чтобы не
// оставлять сиротские файлы на диске.
export async function cleanupUploadedFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}
