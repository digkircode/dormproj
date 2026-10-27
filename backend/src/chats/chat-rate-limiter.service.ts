import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MESSAGE_WINDOW_MS = 5 * 60_000;
const MESSAGE_LIMIT = 50;
const MIN_INTERVAL_MS = 1_000;
const ATTACHMENT_WINDOW_MS = 10 * 60_000;
const ATTACHMENT_LIMIT = 10;

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter((t) => now - t < windowMs);
}

function tooMany(message: string): never {
  throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class ChatRateLimiterService {
  private readonly messageLog = new Map<number, number[]>();
  private readonly attachmentLog = new Map<number, number[]>();

  checkAndRecordMessage(userId: number): void {
    const now = Date.now();

    const messages = prune(this.messageLog.get(userId) ?? [], MESSAGE_WINDOW_MS, now);
    const last = messages[messages.length - 1];
    if (last !== undefined && now - last < MIN_INTERVAL_MS) {
      tooMany('chat.errors.tooFrequent');
    }
    if (messages.length >= MESSAGE_LIMIT) {
      tooMany('chat.errors.tooManyMessages');
    }

    messages.push(now);
    this.messageLog.set(userId, messages);
  }

  checkAndRecordAttachments(userId: number, attachmentCount: number): void {
    if (!attachmentCount) return;
    const now = Date.now();
    const attachments = prune(this.attachmentLog.get(userId) ?? [], ATTACHMENT_WINDOW_MS, now);
    if (attachments.length + attachmentCount > ATTACHMENT_LIMIT) tooMany('chat.errors.tooManyAttachments');
    this.attachmentLog.set(userId, [...attachments, ...new Array(attachmentCount).fill(now)]);
  }
}
