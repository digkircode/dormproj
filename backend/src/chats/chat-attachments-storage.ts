import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';
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
        cb(new BadRequestException(`Недопустимый тип файла: ${file.mimetype || 'неизвестен'}`), false);
        return;
      }
      cb(null, true);
    },
  };
}
