import { BadRequestException } from '@nestjs/common';
import { Prisma, RoomCharacteristicValueType } from '../../generated/prisma/client.js';

// Типизированный EAV: заполнена ровно одна из трёх value*-колонок, какая именно —
// определяет definition.valueType. Эти два хелпера — единственное место, где значение
// переходит между "сырым" видом с фронта/в ответе API (boolean|number|string) и
// колонками БД, чтобы это правило не расползалось по контроллеру.
export interface StoredValueColumns {
  valueBool: boolean | null;
  valueNumber: Prisma.Decimal | number | null;
  valueText: string | null;
}

export function toStoredValue(valueType: RoomCharacteristicValueType, raw: unknown): StoredValueColumns {
  if (valueType === 'BOOLEAN') {
    if (typeof raw !== 'boolean') {
      throw new BadRequestException('Значение характеристики типа BOOLEAN должно быть true/false');
    }
    return { valueBool: raw, valueNumber: null, valueText: null };
  }
  if (valueType === 'NUMBER') {
    // Раньше тут сразу шли в Number(raw) без проверки typeof — Number(true) === 1 и
    // Number(false) === 0 (как и Number(null) === 0) проходили Number.isFinite и тихо
    // записывались как 1/0, хотя boolean/null — не число. Явный typeof-гейт до
    // преобразования (тот же приём, что уже был у BOOLEAN/TEXT веток) закрывает эту
    // прореху — Number(raw) остаётся только для настоящих числовых строк.
    if (typeof raw !== 'number' && typeof raw !== 'string') {
      throw new BadRequestException('Значение характеристики типа NUMBER должно быть числом');
    }
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      throw new BadRequestException('Значение характеристики типа NUMBER должно быть числом');
    }
    return { valueBool: null, valueNumber: num, valueText: null };
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new BadRequestException('Значение характеристики типа TEXT должно быть непустой строкой');
  }
  return { valueBool: null, valueNumber: null, valueText: raw };
}

export function fromStoredValue(
  valueType: RoomCharacteristicValueType,
  row: { valueBool: boolean | null; valueNumber: Prisma.Decimal | null; valueText: string | null },
): boolean | number | string | null {
  if (valueType === 'BOOLEAN') return row.valueBool;
  if (valueType === 'NUMBER') return row.valueNumber === null ? null : Number(row.valueNumber);
  return row.valueText;
}
