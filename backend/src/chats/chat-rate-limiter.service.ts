import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Антиспам конкретно для отправки сообщений проживающими (см. my-chat.controller.ts) —
// не переиспользует общий ThrottlerModule/APP_GUARD (тот IP-based и на весь сайт разом,
// см. app.module.ts), а отдельный sliding-window log по userId, тот же принцип "в памяти
// процесса", что и ChatEventsService (один backend-контейнер, внешний стор не нужен).
// Цифры — по прямой просьбе: не чаще раза в секунду, не больше 50 сообщений за 5 минут,
// вложения отдельно — не больше 10 файлов за 10 минут (тяжелее по нагрузке на диск).
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

  // Бросает 429, если отправка ПРЯМО СЕЙЧАС нарушила бы один из лимитов — иначе
  // регистрирует попытку. Вызывать ДО записи сообщения в БД; если уже успели записать
  // файлы на диск (multer работает раньше тела хендлера) — вызывающий код отвечает за
  // cleanupUploadedFiles при ошибке отсюда, см. my-chat.controller.ts.
  checkAndRecord(userId: number, attachmentCount: number): void {
    const now = Date.now();

    const messages = prune(this.messageLog.get(userId) ?? [], MESSAGE_WINDOW_MS, now);
    const last = messages[messages.length - 1];
    if (last !== undefined && now - last < MIN_INTERVAL_MS) {
      tooMany('Слишком часто — подождите секунду перед следующим сообщением');
    }
    if (messages.length >= MESSAGE_LIMIT) {
      tooMany('Слишком много сообщений подряд — подождите немного');
    }

    if (attachmentCount > 0) {
      const attachments = prune(this.attachmentLog.get(userId) ?? [], ATTACHMENT_WINDOW_MS, now);
      if (attachments.length + attachmentCount > ATTACHMENT_LIMIT) {
        tooMany('Слишком много файлов подряд — подождите немного');
      }
      this.attachmentLog.set(userId, [...attachments, ...new Array(attachmentCount).fill(now)]);
    }

    messages.push(now);
    this.messageLog.set(userId, messages);
  }
}
