import type { Logger } from '@nestjs/common';
import {
  passportApiRecordSchema,
  type PassportApiRecord,
} from './passport-api-record.schema';

// Тот же порог, что у остальных синхронов (см. sync/schemas/validate-student-response.ts).
const MAX_INVALID_RATIO = 0.1;

export class PassportApiFormatError extends Error {}

export function validatePassportApiResponse(
  raw: unknown,
  logger: Logger,
): PassportApiRecord[] {
  if (!Array.isArray(raw)) {
    throw new PassportApiFormatError(
      'Ответ внешнего API — не массив. Похоже, формат ответа изменился.',
    );
  }
  if (raw.length === 0) {
    return [];
  }

  const valid: PassportApiRecord[] = [];
  let invalidCount = 0;

  for (const [index, item] of raw.entries()) {
    const result = passportApiRecordSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      logger.warn(
        `Запись #${index} из ответа внешнего API паспортных данных не прошла валидацию и будет пропущена (${issues})`,
      );
    }
  }

  const invalidRatio = invalidCount / raw.length;
  if (invalidRatio > MAX_INVALID_RATIO) {
    throw new PassportApiFormatError(
      `${invalidCount} из ${raw.length} записей (${Math.round(invalidRatio * 100)}%) не прошли валидацию — похоже, формат ответа внешнего API изменился, а не единичный сбой в паре записей.`,
    );
  }

  return valid;
}
