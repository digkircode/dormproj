import type { Logger } from '@nestjs/common';
import {
  studentApiRecordSchema,
  type StudentApiRecord,
} from './student-api-record.schema';

// Если провалилось больше этой доли записей — считаем, что источник поменял формат
// ответа, а не что попалась пара битых записей. В этом случае лучше прервать
// синхронизацию целиком, чем молча закинуть в базу мусор или почти пустой список.
const MAX_INVALID_RATIO = 0.1;

export class StudentApiFormatError extends Error {}

export function validateStudentApiResponse(
  raw: unknown,
  logger: Logger,
): StudentApiRecord[] {
  if (!Array.isArray(raw)) {
    throw new StudentApiFormatError(
      'Ответ внешнего API — не массив. Похоже, формат ответа изменился.',
    );
  }
  if (raw.length === 0) {
    return [];
  }

  const valid: StudentApiRecord[] = [];
  let invalidCount = 0;

  for (const [index, item] of raw.entries()) {
    const result = studentApiRecordSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      logger.warn(
        `Запись #${index} из ответа внешнего API не прошла валидацию и будет пропущена (${issues})`,
      );
    }
  }

  const invalidRatio = invalidCount / raw.length;
  if (invalidRatio > MAX_INVALID_RATIO) {
    throw new StudentApiFormatError(
      `${invalidCount} из ${raw.length} записей (${Math.round(invalidRatio * 100)}%) не прошли валидацию — похоже, формат ответа внешнего API изменился, а не единичный сбой в паре записей.`,
    );
  }

  return valid;
}
