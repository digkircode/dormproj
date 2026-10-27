import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import type { ChatAttachmentKind } from '../../generated/prisma/client.js';

export const CHAT_UPLOADS_DIR = join(process.cwd(), 'uploads', 'chat');

export function ensureUploadsDir(): void {
  if (!existsSync(CHAT_UPLOADS_DIR)) {
    mkdirSync(CHAT_UPLOADS_DIR, { recursive: true });
  }
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_TOTAL_ATTACHMENT_BYTES = 100 * 1024 * 1024;

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

function generateStorageKey(): string {
  return randomUUID();
}

const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_DIMENSION = 1600;

export async function compressImageInPlace(filePath: string, mimeType: string): Promise<number | null> {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(mimeType)) return null;
  try {
    const original = await readFile(filePath);
    let pipeline = sharp(original)
      .rotate()
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
        cb(null, generateStorageKey()),
    }),
    limits: {
      fileSize: MAX_VIDEO_BYTES,
      files: MAX_ATTACHMENTS_PER_MESSAGE,
      fields: 3,
      parts: MAX_ATTACHMENTS_PER_MESSAGE + 3,
      fieldSize: 16 * 1024,
      fieldNameSize: 100,
      headerPairs: 50,
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
