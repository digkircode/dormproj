import type { Logger } from '@nestjs/common';
import {
  citizenshipApiRecordSchema,
  type CitizenshipApiRecord,
} from './citizenship-api-record.schema';

// Тот же порог, что у студентов/физлиц (см. sync/schemas/validate-student-response.ts).
const MAX_INVALID_RATIO = 0.1;

export class CitizenshipApiFormatError extends Error {}

export function validateCitizenshipApiResponse(
  raw: unknown,
  logger: Logger,
): CitizenshipApiRecord[] {
  if (!Array.isArray(raw)) {
    throw new CitizenshipApiFormatError(
      'Ответ внешнего API — не массив. Похоже, формат ответа изменился.',
    );
  }
  if (raw.length === 0) {
    return [];
  }

  const valid: CitizenshipApiRecord[] = [];
  let invalidCount = 0;

  for (const [index, item] of raw.entries()) {
    const result = citizenshipApiRecordSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      logger.warn(
        `Запись #${index} из ответа внешнего API гражданства не прошла валидацию и будет пропущена (${issues})`,
      );
    }
  }

  const invalidRatio = invalidCount / raw.length;
  if (invalidRatio > MAX_INVALID_RATIO) {
    throw new CitizenshipApiFormatError(
      `${invalidCount} из ${raw.length} записей (${Math.round(invalidRatio * 100)}%) не прошли валидацию — похоже, формат ответа внешнего API изменился, а не единичный сбой в паре записей.`,
    );
  }

  return valid;
}
