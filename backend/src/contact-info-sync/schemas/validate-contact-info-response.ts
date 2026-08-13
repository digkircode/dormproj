import type { Logger } from '@nestjs/common';
import {
  contactInfoApiRecordSchema,
  type ContactInfoApiRecord,
} from './contact-info-api-record.schema';

// Тот же порог, что у остальных синхронов (см. sync/schemas/validate-student-response.ts).
const MAX_INVALID_RATIO = 0.1;

export class ContactInfoApiFormatError extends Error {}

export function validateContactInfoApiResponse(
  raw: unknown,
  logger: Logger,
): ContactInfoApiRecord[] {
  if (!Array.isArray(raw)) {
    throw new ContactInfoApiFormatError(
      'Ответ внешнего API — не массив. Похоже, формат ответа изменился.',
    );
  }
  if (raw.length === 0) {
    return [];
  }

  const valid: ContactInfoApiRecord[] = [];
  let invalidCount = 0;

  for (const [index, item] of raw.entries()) {
    const result = contactInfoApiRecordSchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      logger.warn(
        `Запись #${index} из ответа внешнего API контактной информации не прошла валидацию и будет пропущена (${issues})`,
      );
    }
  }

  const invalidRatio = invalidCount / raw.length;
  if (invalidRatio > MAX_INVALID_RATIO) {
    throw new ContactInfoApiFormatError(
      `${invalidCount} из ${raw.length} записей (${Math.round(invalidRatio * 100)}%) не прошли валидацию — похоже, формат ответа внешнего API изменился, а не единичный сбой в паре записей.`,
    );
  }

  return valid;
}
