import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

interface LogParams {
  userId: number;
  action: AuditAction;
  entityType: string;
  entityId: string | number;
  entityLabel: string;
  // Полные "до"/"после" объекты — сервис сам вырежет из них только fields и сравнит.
  // Для CREATE before обычно null, для DELETE — null after.
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  // Только эти поля участвуют в diff'е — иначе в историю попадали бы служебные значения
  // вроде updatedAt/технических id, которые меняются при любом действии без исключения.
  fields: string[];
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value ?? null;
}

@Injectable()
export class AuditLogService {
  // tx — Prisma.TransactionClient | PrismaService (у обоих есть .auditLog.create) — вызывающий
  // код пишет лог внутри той же транзакции, где меняет сами данные (см. контроллеры), чтобы
  // запись истории не рассинхронизировалась с реальным изменением при ошибке на полпути.
  async log(tx: Prisma.TransactionClient, params: LogParams): Promise<void> {
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const field of params.fields) {
      const beforeValue = serializeValue(params.before?.[field]);
      const afterValue = serializeValue(params.after?.[field]);
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[field] = { before: beforeValue, after: afterValue };
      }
    }
    // Нечего писать (действие не поменяло ни одно из отслеживаемых полей, например
    // "reorder" без реального изменения порядка) — не плодим пустые записи в истории.
    if (Object.keys(changes).length === 0) return;

    await tx.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: String(params.entityId),
        entityLabel: params.entityLabel,
        changes: changes as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
