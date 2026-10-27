import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

interface LogParams {
  userId: number | null;
  action: AuditAction;
  entityType: string;
  entityId: string | number;
  entityLabel: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  fields: string[];
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value ?? null;
}

@Injectable()
export class AuditLogService {
  async log(tx: Prisma.TransactionClient, params: LogParams): Promise<void> {
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const field of params.fields) {
      const beforeValue = serializeValue(params.before?.[field]);
      const afterValue = serializeValue(params.after?.[field]);
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[field] = { before: beforeValue, after: afterValue };
      }
    }
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
