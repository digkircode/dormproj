import { existsSync, mkdirSync } from 'fs';
import { copyFile, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import type { ChatAttachmentKind } from '../../generated/prisma/client.js';

// Persistent docker volume (см. docker-compose.yml — /app/uploads смонтирован как
// chat_uploads), не слой контейнера — иначе файлы терялись бы на каждом
// `docker compose up --build`. process.cwd() внутри контейнера — /app (см. Dockerfile,
// WORKDIR /app, CMD запускает dist/src/main оттуда же).
export const CHAT_UPLOADS_DIR = join(process.cwd(), 'uploads', 'chat');

export function ensureUploadsDir(): void {
  if (!existsSync(CHAT_UPLOADS_DIR)) {
    mkdirSync(CHAT_UPLOADS_DIR, { recursive: true });
  }
}

// Разные потолки для фото/видео (по прямой просьбе) — multer.limits.fileSize ниже
// умеет только ОДНУ общую границу на все файлы сразу, поэтому она выставлена в верхнюю
// (видео), а точный лимит по типу проверяется постфактум после приёма, см.
// validateAttachmentSizes в chat-attachments.ts.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export function attachmentKindForMime(mimeType: string): ChatAttachmentKind | null {
  if (IMAGE_MIME_TYPES.has(mimeType)) return 'IMAGE';
  if (VIDEO_MIME_TYPES.has(mimeType)) return 'VIDEO';
  return null;
}

export function maxBytesForKind(kind: ChatAttachmentKind): number {
  return kind === 'IMAGE' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}

// Имя файла на диске — случайное, не оригинальное (то остаётся только в БД для
// Content-Disposition/показа) — исключает path traversal и коллизии имён.
function generateStorageKey(originalName: string): string {
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
  return `${randomUUID()}${safeExt}`;
}

// Рассылка (см. chats.controller.ts#broadcast) — один и тот же файл уходит нескольким
// получателям, а ChatAttachment.storageKey уникален в схеме (@@unique), поэтому одну
// запись на несколько диалогов не переиспользовать — физически копируем файл под новым
// случайным именем на каждого получателя, кроме первого (тот получает оригинал как есть).
// Осознанный компромисс: дороже по месту на диске, зато без миграции схемы под shared-
// storageKey (и без будущей возни с подсчётом ссылок при удалении).
export async function duplicateStoredFile(sourceStorageKey: string): Promise<string> {
  const ext = sourceStorageKey.includes('.') ? sourceStorageKey.slice(sourceStorageKey.lastIndexOf('.')) : '';
  const newKey = `${randomUUID()}${ext}`;
  await copyFile(join(CHAT_UPLOADS_DIR, sourceStorageKey), join(CHAT_UPLOADS_DIR, newKey));
  return newKey;
}

export async function cleanupStorageKeys(storageKeys: string[]): Promise<void> {
  await Promise.all(storageKeys.map((key) => unlink(join(CHAT_UPLOADS_DIR, key)).catch(() => {})));
}

// Сжатие фото при приёме (2026-08-24, по прямой просьбе — диск ограничен, 20 ГБ, вложения
// чата никогда не удаляются, см. промпт проекта). GIF намеренно не трогаем — типичная
// причина прислать .gif это анимация, а sharp.resize() по умолчанию берёт только первый
// кадр, "сжатие" молча стёрло бы анимацию. Формат на выходе — тот же, что на входе (не
// конвертируем всё в JPEG): storageKey/расширение на диске генерируются один раз при
// приёме и потом никак не меняются, смена формата рассинхронила бы их с mimeType в БД.
const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_DIMENSION = 1600;

// Возвращает новый размер файла в байтах, если сжатие реально уменьшило файл (и
// перезаписывает его на диске тем же путём/именем) — иначе null, оригинал остаётся как
// есть (маленькое/уже оптимизированное фото пересжимать не в плюс, повреждённый файл —
// не блокировать отправку остановкой на ошибке).
export async function compressImageInPlace(filePath: string, mimeType: string): Promise<number | null> {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(mimeType)) return null;
  try {
    // sharp(filePath) (по пути, не по буферу) держит файл открытым/замаппированным на
    // время всего пайплайна — writeFile() в ТОТ ЖЕ путь после этого падает с EBUSY/
    // "unknown error" на Windows (реально словлено при проверке этого фикса локально).
    // Читаем в буфer заранее — источник и назначение больше не пересекаются по хендлу.
    const original = await readFile(filePath);
    let pipeline = sharp(original)
      .rotate() // на смартфонах ориентация чаще всего в EXIF, а не в самих пикселях
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true });
    pipeline =
      mimeType === 'image/png'
        ? pipeline.png({ compressionLevel: 9 })
        : mimeType === 'image/webp'
          ? pipeline.webp({ quality: 78 })
          : pipeline.jpeg({ quality: 78 });
    const output = await pipeline.toBuffer();
    if (output.length >= original.length) return null;
    await writeFile(filePath, output);
    return output.length;
  } catch {
    return null;
  }
}

export function chatAttachmentsMulterOptions() {
  ensureUploadsDir();
  return {
    storage: diskStorage({
      destination: CHAT_UPLOADS_DIR,
      filename: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) =>
        cb(null, generateStorageKey(file.originalname)),
    }),
    limits: {
      fileSize: MAX_VIDEO_BYTES,
      files: MAX_ATTACHMENTS_PER_MESSAGE,
    },
    fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
      if (!attachmentKindForMime(file.mimetype)) {
        const t = I18nContext.current();
        const mimeType = file.mimetype || t?.t('chat.errors.unknownMimeType') || 'неизвестен';
        cb(new BadRequestException(t?.t('chat.errors.invalidFileType', { args: { type: mimeType } }) ?? `Недопустимый тип файла: ${mimeType}`), false);
        return;
      }
      cb(null, true);
    },
  };
}
