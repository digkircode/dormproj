import { Injectable, Inject, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCOUNTING_1C_PROVIDER,
  Accounting1cNotConfiguredError,
  type Accounting1cProvider,
  type AccountingServiceProvisionDetail,
  type AccountingServiceProvisionPush,
} from '../accounting-1c/accounting-1c.types';
import { formatDateOnlyIso } from './build-accounting-payment-payload';
import { isFullMonthAccrualPeriod } from './accrual-generation';
import { startOfMonth, addMonths } from './period-utils';
import { getErrorMessage } from '../sync/sync.errors';
import { ServiceProvisionType } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;

export const SERVICE_PROVISION_SYNC_TYPE = 'service-provision-documents';

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface ContractLine {
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  contractorUid: string | null;
  contractUid: string | null;
  rent: Prisma.Decimal;
  utilities: Prisma.Decimal;
  penalty: Prisma.Decimal;
}

interface StoredServiceProvisionDetail {
  SiteContractID: number;
  ContractNumber: string;
  ResidentIndividualUID: string;
  ResidentFullName: string;
  ContractorUID: string | null;
  ContractUID: string | null;
  SummDetails: number;
  Accounting1cMatched: boolean;
  MissingMappings: ('CONTRACTOR' | 'CONTRACT')[];
}

// The accrual already contains the charge for the whole period (including any
// daily-rate calculation and termination adjustment). Only split that total
// between the two service documents; never multiply the daily rate again.
export function splitServiceProvisionTotal(
  total: Prisma.Decimal,
  monthlyUtilities: Prisma.Decimal,
  isDailyPeriod: boolean,
): { rent: Prisma.Decimal; utilities: Prisma.Decimal } {
  const zero = new Decimal(0);
  const utilitiesCost = monthlyUtilities.greaterThan(0) ? monthlyUtilities : zero;
  if (total.lessThanOrEqualTo(0) || (isDailyPeriod && total.lessThanOrEqualTo(utilitiesCost))) {
    return { rent: total, utilities: zero };
  }
  const utilities = utilitiesCost.lessThan(total) ? utilitiesCost : total;
  return { rent: total.minus(utilities), utilities };
}

// Флоу 3 (см. промпт проекта) — собирает три сводных документа за календарный месяц:
// "Найм" и "Коммуналка" — по всем договорам, у которых есть
// неотменённое начисление за этот месяц (см. collectContractLines — статус договора
// намеренно не смотрим, см. комментарий там), независимо от того, оплачены начисления
// или нет. "Пени" — по журналу фактических начислений за дни этого месяца.
// Все три типа отправляются через ServProvisionDoc.
//
// Документ на сайте строится по нашим начислениям и включает договоры независимо от
// наличия связки с 1С. Отсутствующие ContractorUID/ContractUID сохраняются в детализации
// как явная несопоставленная строка. Отправлять такой документ частично нельзя: итоговая
// сумма разошлась бы с детализацией, поэтому он ждёт сопоставления всех строк.
@Injectable()
export class ServiceProvisionDocService {
  private readonly logger = new Logger(ServiceProvisionDocService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly provider: Accounting1cProvider,
  ) {}

  // НЕ фильтруем по Contract.status (ACTIVE/EXPIRING/OVERDUE/...) — по прямой просьбе
  // 2026-09-04 обсуждали именно так, но при повторной проверке выяснилось: этот крон
  // запускается 1-го числа В 03:00, УЖЕ ПОСЛЕ ночного contract-status.scheduler.ts (01:30) —
  // то есть у любого договора, чей срок закончился ровно в только что прошедшем месяце
  // (обычный, самый частый случай — конец учебного года и т.п.), статус к этому моменту
  // уже COMPLETED, а не ACTIVE. Фильтр по статусу СИСТЕМАТИЧЕСКИ вырезал бы из документа
  // ИМЕННО последний, самый важный месяц проживания у каждого завершившегося договора.
  // Начисление (Accrual) — куда более надёжный сигнал "комната реально занималась этот
  // месяц": оно генерируется один раз на весь срок при создании договора и не переоценивается
  // по статусу задним числом; при досрочном расторжении voidedAt снимает только БУДУЩИЕ
  // периоды, а начисление на месяц самого расторжения не воидится, а пересчитывается
  // (adjustmentAmount) — см. termination.ts. Поэтому фильтруем прямо по наличию
  // неотменённого начисления за целевой месяц, статус договора вообще не смотрим.
  private async collectContractLines(monthStart: Date, nextMonthStart: Date): Promise<ContractLine[]> {
    const [contracts, dormitoryInfo] = await Promise.all([
      this.prisma.contract.findMany({
        where: {
          accruals: { some: { periodStart: { gte: monthStart, lt: nextMonthStart }, voidedAt: null } },
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          number: true,
          residentIndividualUid: true,
          accounting1cUid: true,
          resident: { select: { fullName: true, accounting1cContractorUid: true } },
          terms: {
            orderBy: { validFrom: 'desc' },
            select: { validFrom: true, validTo: true, rentAmount: true, utilitiesAmount: true },
          },
          accruals: {
            where: { periodStart: { gte: monthStart, lt: nextMonthStart }, voidedAt: null },
            orderBy: { periodStart: 'asc' },
            select: { periodStart: true, periodEnd: true, rentAmount: true, utilitiesAmount: true, adjustmentAmount: true },
          },
        },
      }),
      this.prisma.dormitoryInfo.findUnique({ where: { id: 1 }, select: { communalServicesCost: true } }),
    ]);

    const lines: ContractLine[] = [];
    for (const contract of contracts) {
      if (contract.accruals.length === 0) continue;
      // One line per contract and month. The accrual is the source of the total
      // even for partial/daily periods and early termination; its existing split
      // can be proportional and is not the split required by these documents.
      const total = contract.accruals.reduce(
        (sum, accrual) => sum.plus(accrual.rentAmount).plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount),
        new Decimal(0),
      );
      const firstPeriod = contract.accruals[0];
      const terms = contract.terms.find((item) => item.validFrom <= firstPeriod.periodStart
        && (item.validTo === null || item.validTo > firstPeriod.periodStart));
      // New contracts have a fixed utilities amount in their terms. Older
      // contracts and daily-only rooms have zero there, so use the dormitory
      // setting, as the printed contract already does for legacy contracts.
      const monthlyUtilities = terms?.utilitiesAmount.greaterThan(0)
        ? terms.utilitiesAmount
        : dormitoryInfo?.communalServicesCost;
      if (monthlyUtilities == null) {
        throw new Error(`Не задана стоимость коммунальных услуг для документа по договору №${contract.number}`);
      }
      const dailyOnlyRoom = !!terms && terms.rentAmount.isZero() && terms.utilitiesAmount.isZero();
      const isDailyPeriod = dailyOnlyRoom
        || contract.accruals.some((accrual) => !isFullMonthAccrualPeriod(accrual.periodStart, accrual.periodEnd)
          || !accrual.adjustmentAmount.isZero());
      const { rent, utilities } = splitServiceProvisionTotal(total, monthlyUtilities, isDailyPeriod);
      lines.push({
        contractId: contract.id,
        contractNumber: contract.number,
        residentIndividualUid: contract.residentIndividualUid,
        residentFullName: contract.resident.fullName,
        contractorUid: contract.resident.accounting1cContractorUid,
        contractUid: contract.accounting1cUid,
        rent,
        utilities,
        penalty: new Decimal(0),
      });
    }
    return lines;
  }

  private async collectPenaltyLines(monthStart: Date, nextMonthStart: Date): Promise<ContractLine[]> {
    return this.prisma.$transaction(async (tx) => {
      const totals = await tx.penaltyAccrualLog.groupBy({
        by: ['contractId'],
        where: { date: { gte: monthStart, lt: nextMonthStart } },
        _sum: { amount: true },
        orderBy: { contractId: 'asc' },
      });
      if (totals.length === 0) return [];

      const contracts = await tx.contract.findMany({
        where: { id: { in: totals.map((item) => item.contractId) } },
        select: {
          id: true,
          number: true,
          residentIndividualUid: true,
          accounting1cUid: true,
          resident: { select: { fullName: true, accounting1cContractorUid: true } },
        },
      });
      const byId = new Map(contracts.map((contract) => [contract.id, contract]));
      return totals.map((item) => {
        const contract = byId.get(item.contractId);
        if (!contract || item._sum.amount === null) {
          throw new Error(`Не удалось собрать пеню по договору ID ${item.contractId}`);
        }
        return {
          contractId: item.contractId,
          contractNumber: contract.number,
          residentIndividualUid: contract.residentIndividualUid,
          residentFullName: contract.resident.fullName,
          contractorUid: contract.resident.accounting1cContractorUid,
          contractUid: contract.accounting1cUid,
          rent: new Decimal(0),
          utilities: new Decimal(0),
          penalty: item._sum.amount,
        };
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private buildDetails(lines: ContractLine[], pick: (line: ContractLine) => Prisma.Decimal): {
    details: StoredServiceProvisionDetail[];
    total: Prisma.Decimal;
  } {
    const details: StoredServiceProvisionDetail[] = [];
    let total = new Decimal(0);
    for (const line of lines) {
      const amount = pick(line);
      if (amount.lessThanOrEqualTo(0)) continue;
      const missingMappings: StoredServiceProvisionDetail['MissingMappings'] = [];
      if (!line.contractorUid) missingMappings.push('CONTRACTOR');
      if (!line.contractUid) missingMappings.push('CONTRACT');
      details.push({
        SiteContractID: line.contractId,
        ContractNumber: line.contractNumber,
        ResidentIndividualUID: line.residentIndividualUid,
        ResidentFullName: line.residentFullName,
        ContractorUID: line.contractorUid,
        ContractUID: line.contractUid,
        SummDetails: Number(amount),
        Accounting1cMatched: missingMappings.length === 0,
        MissingMappings: missingMappings,
      });
      total = total.plus(amount);
    }
    return { details, total };
  }

  // Документ всегда ограничен полуинтервалом [первое число месяца; первое число
  // следующего месяца). Поэтому ручной пересчёт августа после создания сентябрьских
  // документов не может захватить ни одно сентябрьское начисление.
  async computeAndSave(
    targetMonth: Date = new Date(),
    requestedTypes: ServiceProvisionType[] = ['RENT', 'UTILITIES', 'PENALTY'],
  ): Promise<{ documentIds: number[] }> {
    const monthStart = startOfMonth(targetMonth);
    const nextMonthStart = addMonths(monthStart, 1);
    const [lines, penaltyLines] = await Promise.all([
      requestedTypes.some((type) => type === 'RENT' || type === 'UTILITIES')
        ? this.collectContractLines(monthStart, nextMonthStart) : Promise.resolve([]),
      requestedTypes.includes('PENALTY')
        ? this.collectPenaltyLines(monthStart, nextMonthStart) : Promise.resolve([]),
    ]);
    const monthLabel = `${MONTHS_NOMINATIVE[monthStart.getUTCMonth()]} ${monthStart.getUTCFullYear()}`;
    const rent = this.buildDetails(lines, (line) => line.rent);
    const utilities = this.buildDetails(lines, (line) => line.utilities);
    const penalties = this.buildDetails(penaltyLines, (line) => line.penalty);

    const specs: { type: ServiceProvisionType; nomenclature: 'Найм' | 'Коммуналка' | 'Пени'; commentLabel: string; details: StoredServiceProvisionDetail[]; total: Prisma.Decimal }[] = [
      { type: 'RENT', nomenclature: 'Найм', commentLabel: 'Найм услуги', details: rent.details, total: rent.total },
      { type: 'UTILITIES', nomenclature: 'Коммуналка', commentLabel: 'Коммунальные услуги', details: utilities.details, total: utilities.total },
      { type: 'PENALTY', nomenclature: 'Пени', commentLabel: 'Пени', details: penalties.details, total: penalties.total },
    ];

    const documentIds: number[] = [];
    for (const spec of specs.filter((item) => requestedTypes.includes(item.type))) {
      const rawPayloadBase = {
        Date: formatDateOnlyIso(monthStart),
        NomenclatureType: spec.nomenclature,
        DocumentSumm: Number(spec.total),
        Comment: `HostelRosNOUWeb | ${spec.commentLabel} | ${monthLabel}`,
        DocumentSummDetails: spec.details,
      };
      const existing = await this.prisma.serviceProvisionDocument.findUnique({
        where: { periodStart_type: { periodStart: monthStart, type: spec.type } },
        select: { rawPayload: true },
      });
      const payloadChanged = existing !== null && JSON.stringify(existing.rawPayload) !== JSON.stringify(rawPayloadBase);
      const row = await this.prisma.serviceProvisionDocument.upsert({
        where: { periodStart_type: { periodStart: monthStart, type: spec.type } },
        create: {
          periodStart: monthStart,
          type: spec.type,
          documentSumm: spec.total,
          contractCount: spec.details.length,
          rawPayload: rawPayloadBase as unknown as Prisma.InputJsonValue,
        },
        update: {
          documentSumm: spec.total,
          contractCount: spec.details.length,
          rawPayload: rawPayloadBase as unknown as Prisma.InputJsonValue,
          ...(payloadChanged ? { accounting1cSyncStatus: 'NOT_SYNCED' as const, accounting1cSyncError: null } : {}),
        },
      });
      documentIds.push(row.id);
    }

    this.logger.log(`Оказание услуг за ${monthStart.toISOString().slice(0, 7)}: пересчитано документов ${documentIds.length}`);
    return { documentIds };
  }

  async recalculateDocuments(ids: number[]): Promise<{ requested: number; recalculated: number }> {
    const uniqueIds = [...new Set(ids)];
    const documents = await this.prisma.serviceProvisionDocument.findMany({
      where: { id: { in: uniqueIds } },
      select: { periodStart: true, type: true },
    });
    const groups = new Map<number, { month: Date; types: Set<ServiceProvisionType> }>();
    for (const document of documents) {
      const key = document.periodStart.getTime();
      const group = groups.get(key) ?? { month: document.periodStart, types: new Set<ServiceProvisionType>() };
      group.types.add(document.type);
      groups.set(key, group);
    }
    let recalculated = 0;
    for (const group of groups.values()) {
      const result = await this.computeAndSave(group.month, [...group.types]);
      recalculated += result.documentIds.length;
    }
    return { requested: uniqueIds.length, recalculated };
  }

  private buildPushItem(row: {
    id: number;
    rawPayload: Prisma.JsonValue;
    accounting1cDocumentUid: string | null;
  }): AccountingServiceProvisionPush | null {
    const raw = row.rawPayload as unknown as {
      Date: string;
      NomenclatureType: 'Найм' | 'Коммуналка' | 'Пени';
      DocumentSumm: number;
      Comment: string;
      DocumentSummDetails?: StoredServiceProvisionDetail[];
    };
    const details = Array.isArray(raw.DocumentSummDetails) ? raw.DocumentSummDetails : [];
    if (details.length === 0 || details.some((detail) => !detail.ContractorUID || !detail.ContractUID)) return null;
    const accountingDetails: AccountingServiceProvisionDetail[] = details.map((detail) => ({
      ContractorUID: detail.ContractorUID!,
      ContractUID: detail.ContractUID!,
      SummDetails: detail.SummDetails,
    }));
    return {
      SiteDocumentID: row.id,
      Date: raw.Date,
      NomenclatureType: raw.NomenclatureType,
      DocumentSumm: raw.DocumentSumm,
      Comment: raw.Comment,
      DocumentSummDetails: accountingDetails,
      DocumentUID: row.accounting1cDocumentUid ?? undefined,
    };
  }

  // Отправляет ровно выбранные сохранённые документы и не пересчитывает их скрыто.
  // Это позволяет повторно отправить август после появления сентябрьских строк, не
  // затронув сентябрь, и делает GET списка полностью read-only.
  async sendDocuments(ids: number[]): Promise<{ pushed: number; succeeded: number; failed: number; blocked: number; skipped: boolean }> {
    const uniqueIds = [...new Set(ids)];
    const rows = await this.prisma.serviceProvisionDocument.findMany({
      where: { id: { in: uniqueIds } },
      orderBy: [{ periodStart: 'asc' }, { type: 'asc' }],
      select: { id: true, rawPayload: true, accounting1cDocumentUid: true },
    });
    const items: AccountingServiceProvisionPush[] = [];
    let blocked = uniqueIds.length - rows.length;
    for (const row of rows) {
      const item = this.buildPushItem(row);
      if (item) items.push(item);
      else blocked++;
    }
    if (items.length === 0) {
      return { pushed: 0, succeeded: 0, failed: 0, blocked, skipped: true };
    }
    if (!this.provider.isServiceProvisionConfigured()) {
      this.logger.warn('1С Бухгалтерия (оказание услуг) не настроена - пропуск отправки');
      return { pushed: 0, succeeded: 0, failed: 0, blocked, skipped: true };
    }

    let results: Awaited<ReturnType<Accounting1cProvider['pushServiceProvisionDocs']>>;
    try {
      results = await this.provider.pushServiceProvisionDocs(items);
    } catch (error) {
      if (error instanceof Accounting1cNotConfiguredError) return { pushed: 0, succeeded: 0, failed: 0, blocked, skipped: true };
      // Сеть/сервис недоступны целиком — статусы строк не трогаем (остаются в прежнем
      // состоянии — NOT_SYNCED при первой попытке, или прежний статус при повторе),
      // следующий автоматический прогон (или ручной повтор) попробует заново.
      this.logger.error(`Не удалось отправить документы "оказание услуг" в 1С: ${getErrorMessage(error)}`);
      return { pushed: items.length, succeeded: 0, failed: 0, blocked, skipped: false };
    }

    let succeeded = 0;
    let failed = 0;
    for (const item of items) {
      const result = results.find((r) => r.SiteDocumentID === item.SiteDocumentID);
      if (!result) continue;
      if (result.FinalStatus) {
        succeeded++;
        await this.prisma.serviceProvisionDocument.update({
          where: { id: item.SiteDocumentID },
          data: {
            accounting1cSyncStatus: 'SYNCED',
            accounting1cDocumentUid: result.DocumentUID ?? item.DocumentUID ?? null,
            accounting1cSyncError: null,
            accounting1cSyncedAt: new Date(),
          },
        });
      } else {
        failed++;
        await this.prisma.serviceProvisionDocument.update({
          where: { id: item.SiteDocumentID },
          data: {
            accounting1cSyncStatus: 'FAILED',
            accounting1cSyncError: result.ERROR ?? 'Неизвестная ошибка 1С',
            accounting1cSyncedAt: new Date(),
          },
        });
      }
    }

    this.logger.log(`Оказание услуг: отправлено выбранных документов ${items.length}, успешно ${succeeded}, ошибок ${failed}, заблокировано ${blocked}`);
    return { pushed: items.length, succeeded, failed, blocked, skipped: false };
  }

  async retryUnsyncedMonth(targetMonth: Date): Promise<{ pushed: number; succeeded: number; failed: number; blocked: number; skipped: boolean }> {
    const monthStart = startOfMonth(targetMonth);
    const documents = await this.prisma.serviceProvisionDocument.findMany({
      where: { periodStart: monthStart, accounting1cSyncStatus: { not: 'SYNCED' } },
      select: { id: true },
    });
    return this.sendDocuments(documents.map((document) => document.id));
  }

  // Финальный автоматический прогон: пересчитывает и отправляет только документы
  // переданного месяца. По умолчанию это текущий календарный месяц.
  async run(targetMonth: Date = new Date()): Promise<{ pushed: number; succeeded: number; failed: number; blocked: number; skipped: boolean }> {
    const { documentIds } = await this.computeAndSave(targetMonth);
    return this.sendDocuments(documentIds);
  }
}
