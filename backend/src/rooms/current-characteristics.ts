import type { RoomCharacteristicValueType } from '../../generated/prisma/client.js';
import { fromStoredValue } from './characteristic-value';

export interface CharacteristicValueRow {
  id: number;
  definitionId: number;
  period: Date;
  valueBool: boolean | null;
  valueNumber: import('../../generated/prisma/client.js').Prisma.Decimal | null;
  valueText: string | null;
  isProtected: boolean;
  definition: { name: string; valueType: RoomCharacteristicValueType; unit: string | null };
}

export interface CurrentCharacteristic {
  id: number;
  definitionId: number;
  name: string;
  valueType: RoomCharacteristicValueType;
  unit: string | null;
  value: boolean | number | string | null;
  period: Date;
  isProtected: boolean;
}

// "Актуальное" значение характеристики — просто ряд с максимальным period на пару
// (room, definition), в отличие от pickLatestContactInfo у физлиц period здесь всегда
// надёжен (не 1С-сентинел), поэтому без эвристик — обычный max по дате.
export function pickCurrentCharacteristics(values: CharacteristicValueRow[]): CurrentCharacteristic[] {
  const latestByDefinition = new Map<number, CharacteristicValueRow>();
  for (const value of values) {
    const current = latestByDefinition.get(value.definitionId);
    if (!current || value.period > current.period) {
      latestByDefinition.set(value.definitionId, value);
    }
  }

  return [...latestByDefinition.values()]
    .map((row) => ({
      id: row.id,
      definitionId: row.definitionId,
      name: row.definition.name,
      valueType: row.definition.valueType,
      unit: row.definition.unit,
      value: fromStoredValue(row.definition.valueType, row),
      period: row.period,
      isProtected: row.isProtected,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
