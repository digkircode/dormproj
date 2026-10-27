import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';

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
    const fieldErrors = 'fieldErrors' in body && typeof body.fieldErrors === 'object' && body.fieldErrors !== null
      ? Object.fromEntries(Object.entries(body.fieldErrors).map(([field, value]) => [field, translate(value)]))
      : undefined;
    response.status(status).json({ ...body, message, ...(fieldErrors ? { fieldErrors } : {}) });
  }
}
