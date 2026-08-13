import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, retry, timer } from 'rxjs';
import type { Env } from '../config/env.schema';
import { getErrorMessage } from '../sync/sync.errors';
import type { PassportApiRecord } from './schemas/passport-api-record.schema';
import { validatePassportApiResponse } from './schemas/validate-passport-response';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

@Injectable()
export class ExternalPassportApiService {
  private readonly logger = new Logger(ExternalPassportApiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // uids — FizicheskoyeLitsoUID из таблицы individuals (кроме isManual), а не полный
  // список от источника: этот эндпоинт 1С тоже отдаёт данные только по запрошенным UID.
  async fetchPassports(uids: string[]): Promise<PassportApiRecord[]> {
    if (uids.length === 0) {
      return [];
    }
    const raw = await this.fetchWithRetry(uids);
    return validatePassportApiResponse(raw, this.logger);
  }

  private async fetchWithRetry(uids: string[]): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.http
          .post<unknown>(
            this.config.get('EXTERNAL_API_PASSPORT_URL', { infer: true }),
            uids,
            {
              auth: {
                username: this.config.get('EXTERNAL_API_LOGIN', {
                  infer: true,
                }),
                password: this.config.get('EXTERNAL_API_PASSWORD', {
                  infer: true,
                }),
              },
              timeout: REQUEST_TIMEOUT_MS,
            },
          )
          .pipe(
            retry({
              count: MAX_ATTEMPTS - 1,
              delay: (error, retryCount) => {
                // Логируем только message, а не сам error/response — в config axios-ошибки
                // лежит Authorization-заголовок, и его нельзя писать в лог.
                this.logger.warn(
                  `Попытка ${retryCount}/${MAX_ATTEMPTS - 1} получить паспортные данные из внешнего API не удалась: ${getErrorMessage(error)}`,
                );
                return timer(RETRY_DELAY_MS * retryCount);
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      throw new Error(
        `Не удалось получить паспортные данные из внешнего API за ${MAX_ATTEMPTS} попыток: ${getErrorMessage(error)}`,
        { cause: error },
      );
    }
  }
}
