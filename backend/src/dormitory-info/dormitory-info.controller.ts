import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';

// Общежитие одно — ровно одна строка, id зафиксирован.
const SINGLETON_ID = 1;

const updateSchema = z.object({
  communalServicesCost: z.number().finite().nullish(),
  dailyPaymentInternal: z.number().finite().nullish(),
  dailyPaymentOther: z.number().finite().nullish(),
});

interface DormitoryInfoRow {
  communalServicesCost: Prisma.Decimal | null;
  dailyPaymentInternal: Prisma.Decimal | null;
  dailyPaymentOther: Prisma.Decimal | null;
  updatedAt: Date;
}

function serialize(row: DormitoryInfoRow) {
  return {
    communalServicesCost: row.communalServicesCost === null ? null : Number(row.communalServicesCost),
    dailyPaymentInternal: row.dailyPaymentInternal === null ? null : Number(row.dailyPaymentInternal),
    dailyPaymentOther: row.dailyPaymentOther === null ? null : Number(row.dailyPaymentOther),
    updatedAt: row.updatedAt,
  };
}

@Controller('dormitory-info')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class DormitoryInfoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // upsert вместо findUnique — строка не сидится миграцией (см. migration.sql), первое
  // чтение после миграции создаёт её сама, дальше always update {} — не изменяет её.
  @Get()
  async get() {
    const row = await this.prisma.dormitoryInfo.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    return serialize(row);
  }

  @Patch()
  async update(@Body() body: unknown, @Req() req: Request) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const before = await this.prisma.dormitoryInfo.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID }, update: {} });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dormitoryInfo.upsert({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...parsed.data },
        update: parsed.data,
      });
      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'DormitoryInfo',
        entityId: SINGLETON_ID,
        entityLabel: 'Настройки общежития',
        before,
        after: updated,
        fields: ['communalServicesCost', 'dailyPaymentInternal', 'dailyPaymentOther'],
      });
      return serialize(updated);
    });
  }
}
