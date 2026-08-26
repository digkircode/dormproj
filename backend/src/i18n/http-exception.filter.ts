import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';

// В проекте нет глобального exception filter (см. известные проблемы в DormProjPrompt.md) —
// это первый и единственный, добавлен ровно под локализацию. Не меняет статус/структуру
// ответа, только переводит text-поле message. Контроллеры кидают исключения либо со
// стабильным i18n-ключом (например 'auth.notAuthorized'), либо, для ещё не мигрированных
// по плану локализации мест, с литеральной русской строкой — I18nService.translate()
// на отсутствующий ключ безопасно возвращает сам аргумент как есть (см. i18n.service.js),
// поэтому немигрированные сообщения просто продолжают показываться на русском независимо
// от языка интерфейса, ничего не ломается по пути.
@Catch(HttpException)
export class I18nHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18n: I18nService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const lang = I18nContext.current(host)?.lang;

    if (typeof body !== 'object' || body === null || !('message' in body)) {
      response.status(status).json(body);
      return;
    }

    const translate = (value: unknown) => (typeof value === 'string' ? this.i18n.translate(value, { lang }) : value);
    const raw = (body as { message: unknown }).message;
    const message = Array.isArray(raw) ? raw.map(translate) : translate(raw);
    response.status(status).json({ ...body, message });
  }
}
