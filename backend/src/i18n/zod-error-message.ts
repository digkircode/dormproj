import type { ZodError } from 'zod';

// ZodError.message по умолчанию — JSON.stringify() всего массива issues (см. zod v4),
// не читаемый текст — до этого хелпера `throw new BadRequestException(parsed.error.message)`
// (см. controller'ы) отправлял этот JSON-дамп клиенту как есть. Берём текст первого issue —
// то же сообщение, что задано в схеме (`.min(1, 'Обязательное поле')` и т.п.), уже
// пригодное и для показа, и для перевода через I18nHttpExceptionFilter (см. http-exception.filter.ts),
// если схема задаёт его ключом i18n вместо литерала.
export function zodErrorMessage(error: ZodError): string {
  return error.issues[0]?.message ?? error.message;
}
