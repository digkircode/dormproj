import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, retry, timer } from 'rxjs';
import type { Env } from '../config/env.schema';
import type { StudentApiRecord } from './schemas/student-api-record.schema';
import { validateStudentApiResponse } from './schemas/validate-student-response';
import { getErrorMessage } from './sync.errors';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

@Injectable()
export class ExternalStudentApiService {
  private readonly logger = new Logger(ExternalStudentApiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async fetchActiveStudents(): Promise<StudentApiRecord[]> {
    const raw = await this.fetchWithRetry();
    return validateStudentApiResponse(raw, this.logger);
  }

  // Тот же эндпоинт, что и полный список, но с фильтром по одному физлицу — источник
  // сам возвращает только его действующие зачётки (может быть 0, если человек сейчас
  // не студент). Используется точечной ручной синхронизацией с карточки физлица.
  async fetchActiveStudentsByUid(uid: string): Promise<StudentApiRecord[]> {
    const raw = await this.fetchWithRetry({ FizicheskoyeLitsoUID: uid });
    return validateStudentApiResponse(raw, this.logger);
  }

  private async fetchWithRetry(params?: Record<string, string>): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.http
          .get<unknown>(this.config.get('EXTERNAL_API_URL', { infer: true }), {
            auth: {
              username: this.config.get('EXTERNAL_API_LOGIN', { infer: true }),
              password: this.config.get('EXTERNAL_API_PASSWORD', {
                infer: true,
              }),
            },
            params,
            timeout: REQUEST_TIMEOUT_MS,
          })
          .pipe(
            retry({
              count: MAX_ATTEMPTS - 1,
              delay: (error, retryCount) => {
                // Логируем только message, а не сам error/response — в config axios-ошибки
                // лежит Authorization-заголовок, и его нельзя писать в лог.
                this.logger.warn(
                  `Попытка ${retryCount}/${MAX_ATTEMPTS - 1} получить данные из внешнего API не удалась: ${getErrorMessage(error)}`,
                );
                return timer(RETRY_DELAY_MS * retryCount);
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      throw new Error(
        `Не удалось получить данные из внешнего API за ${MAX_ATTEMPTS} попыток: ${getErrorMessage(error)}`,
        { cause: error },
      );
    }
  }
}
