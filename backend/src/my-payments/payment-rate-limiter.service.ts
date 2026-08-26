import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Антиспам на создание платёжных попыток — тот же приём "в памяти процесса, sliding
// window по userId", что и ChatRateLimiterService (chats/chat-rate-limiter.service.ts),
// не переиспользует общий ThrottlerModule (тот IP-based на весь сайт). Каждая попытка —
// реальный поход к токену банка, лимит защищает и банк, и нас от случайного/скриптового
// дабл-клика.
const WINDOW_MS = 10 * 60_000;
const LIMIT = 10;

@Injectable()
export class PaymentRateLimiterService {
  private readonly log = new Map<number, number[]>();

  checkAndRecord(userId: number): void {
    const now = Date.now();
    const attempts = (this.log.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (attempts.length >= LIMIT) {
      throw new HttpException('payment.errors.tooManyAttempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    attempts.push(now);
    this.log.set(userId, attempts);
  }
}
