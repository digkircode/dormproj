import type { Logger } from '@nestjs/common';
import {
  individualApiRecordSchema,
  type IndividualApiRecord,
} from './individual-api-record.schema';

// Тот же порог, что и у студентов (см. sync/schemas/validate-student-response.ts) —
// пара битых записей пропускается, но резкий рост доли невалидных значит смену формата.
const MAX_INVALID_RATIO = 0.1;

export class IndividualApiFormatError extends Error {}

export function validateIndividualApiResponse(
  raw: unknown,
  logger: Logger,
): IndividualApiRecord[] {
  if (!Array.isArray(raw)) {
    throw new IndividualApiFormatError(
      'Ответ внешнего API — не массив. Похоже, формат ответа изменился.',
    );
  }
  if (raw.length === 0) {
    return [];
  }

  const valid: IndividualApiRecord[] = [];
  let invalidCount = 0;

  for (const [index, item] of raw.entries()) {
    const result = individualApiRecordSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      logger.warn(
        `Запись #${index} из ответа внешнего API физлиц не прошла валидацию и будет пропущена (${issues})`,
      );
    }
  }

  const invalidRatio = invalidCount / raw.length;
  if (invalidRatio > MAX_INVALID_RATIO) {
    throw new IndividualApiFormatError(
      `${invalidCount} из ${raw.length} записей (${Math.round(invalidRatio * 100)}%) не прошли валидацию — похоже, формат ответа внешнего API изменился, а не единичный сбой в паре записей.`,
    );
  }

  return valid;
}
