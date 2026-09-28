import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatRateLimiterService } from './chat-rate-limiter.service';

const MAX_REQUEST_BYTES = 100 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 8;
const MAX_CONCURRENT_PER_USER = 2;

@Injectable()
export class ChatUploadGuard implements CanActivate {
  private active = 0;
  private readonly activeByUser = new Map<number, number>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const userId = req.user?.id;
    if (!userId) return false;
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw new PayloadTooLargeException();
    if (this.active >= MAX_CONCURRENT_UPLOADS || (this.activeByUser.get(userId) ?? 0) >= MAX_CONCURRENT_PER_USER) {
      throw new HttpException('chat.errors.tooFrequent', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.active++;
    this.activeByUser.set(userId, (this.activeByUser.get(userId) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active--;
      const count = (this.activeByUser.get(userId) ?? 1) - 1;
      if (count) this.activeByUser.set(userId, count);
      else this.activeByUser.delete(userId);
    };
    res.once('finish', release);
    res.once('close', release);
    req.once('aborted', release);
    return true;
  }
}

@Injectable()
export class ResidentMessageRateGuard implements CanActivate {
  constructor(private readonly limiter: ChatRateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const userId = context.switchToHttp().getRequest<Request>().user?.id;
    if (!userId) return false;
    this.limiter.checkAndRecordMessage(userId);
    return true;
  }
}
