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
import { startOfMonth, endOfMonth, addMonths } from './period-utils';
import { getErrorMessage } from '../sync/sync.errors';
import { ServiceProvisionType } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface ContractLine {
  contractorUid: string;
  contractUid: string;
  rent: Prisma.Decimal;
  utilities: Prisma.Decimal;
}

// Флоу 3 (см. промпт проекта) — раз в месяц, в начале следующего месяца (см.
// service-provision-doc.scheduler.ts), собирает ДВА сводных документа за только что
// закончившийся месяц — "Найм" и "Коммуналка" отдельно — по всем договорам, у которых есть
// неотменённое начисление за этот месяц (см. collectContractLines — статус договора
// намеренно не смотрим, см. комментарий там), независимо от того, оплачены начисления
// или нет. Отправляет пачкой в 1С (ServProvisionDoc).
//
// ВАЖНОЕ ОГРАНИЧЕНИЕ: строка документа требует ContractorUID+ContractUID — 1С не подтвердила
// (в отличие от флоу 1), что при их отсутствии эндпоинт сам создаст контрагента/договор И
// вернёт нам новый UID (сама форма ответа — только {SiteDocumentID, DocumentUID,
// FinalStatus} НА ВЕСЬ документ, никакого per-строчного эха UID, в отличие от ответа
// флоу 1). Поэтому договор без уже известной пары UID (см. payment-imports-ingest.service.ts —
// та же практическая проблема у флоу 2) в документ просто не попадает — иначе рисковали бы
// либо получить ошибку от 1С, либо тихо расплодить неопознаваемых дублей контрагентов.
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
  private async collectContractLines(monthStart: Date, monthEnd: Date): Promise<ContractLine[]> {
    const contracts = await this.prisma.contract.findMany({
      where: {
        accounting1cUid: { not: null },
        resident: { accounting1cContractorUid: { not: null } },
        accruals: { some: { periodStart: { gte: monthStart, lte: monthEnd }, voidedAt: null } },
      },
      select: {
        accounting1cUid: true,
        resident: { select: { accounting1cContractorUid: true } },
        accruals: {
          where: { periodStart: { gte: monthStart, lte: monthEnd }, voidedAt: null },
          select: { rentAmount: true, utilitiesAmount: true, adjustmentAmount: true },
        },
      },
    });

    const lines: ContractLine[] = [];
    for (const contract of contracts) {
      if (contract.accruals.length === 0) continue;
      // Обычно ровно одно начисление на месяц — сумма на случай, если когда-нибудь
      // появится больше одной строки за один и тот же период (защитно, не рабочий кейс).
      // adjustmentAmount (ручная корректировка, см. Accrual в schema.prisma) — в "Найм",
      // это единственная сторона, к которой её можно осмысленно отнести: сам тип
      // корректировки не размечен как "по найму"/"по коммуналке" отдельно.
      let rent = new Decimal(0);
      let utilities = new Decimal(0);
      for (const accrual of contract.accruals) {
        rent = rent.plus(accrual.rentAmount).plus(accrual.adjustmentAmount);
        utilities = utilities.plus(accrual.utilitiesAmount);
      }
      lines.push({
        contractorUid: contract.resident.accounting1cContractorUid!,
        contractUid: contract.accounting1cUid!,
        rent,
        utilities,
      });
    }
    return lines;
  }

  private buildDetails(lines: ContractLine[], pick: (line: ContractLine) => Prisma.Decimal): {
    details: AccountingServiceProvisionDetail[];
    total: Prisma.Decimal;
  } {
    const details: AccountingServiceProvisionDetail[] = [];
    let total = new Decimal(0);
    for (const line of lines) {
      const amount = pick(line);
      if (amount.lessThanOrEqualTo(0)) continue;
      details.push({ ContractorUID: line.contractorUid, ContractUID: line.contractUid, SummDetails: Number(amount) });
      total = total.plus(amount);
    }
    return { details, total };
  }

  // targetMonth — любая дата ВНУТРИ целевого месяца (по умолчанию — только что
  // закончившийся, см. scheduler). Параметр оставлен на будущее — если понадобится ручной
  // повтор/пересборка за конкретный прошлый месяц, эту же функцию можно вызвать с ним
  // напрямую, не дублируя логику в отдельном контроллере.
  //
  // Раньше это было частью run() и выполнялось только если интеграция с 1С уже
  // сконфигурирована — то есть без реквизитов страница /finance/service-docs оставалась
  // пустой навсегда, хотя сами суммы по найму/коммуналке считаются из наших же начислений
  // и не зависят от 1С вообще. По прямой просьбе 2026-09-04 подсчёт отделён от отправки:
  // считает и сохраняет строки в БД БЕЗ проверки isServiceProvisionConfigured() — вызывается
  // на каждый GET /service-provision-documents (см. billing.controller.ts), поэтому список
  // виден сразу, ещё до первой реальной отправки. Отправка в 1С — только run() ниже, по
  // кнопке "Отправить".
  async computeAndSave(targetMonth: Date = addMonths(new Date(), -1)): Promise<{ items: AccountingServiceProvisionPush[] }> {
    const monthStart = startOfMonth(targetMonth);
    const monthEnd = endOfMonth(targetMonth);
    const lines = await this.collectContractLines(monthStart, monthEnd);
    if (lines.length === 0) {
      this.logger.log(`Оказание услуг за ${monthStart.toISOString().slice(0, 7)}: нет ни одного договора с начислением за этот месяц и уже известной парой ContractorUID/ContractUID — считать нечего`);
      return { items: [] };
    }

    const monthLabel = `${MONTHS_NOMINATIVE[monthStart.getUTCMonth()]} ${monthStart.getUTCFullYear()}`;
    const rent = this.buildDetails(lines, (l) => l.rent);
    const utilities = this.buildDetails(lines, (l) => l.utilities);

    const specs: { type: ServiceProvisionType; nomenclature: 'Найм' | 'Коммуналка'; commentLabel: string; details: AccountingServiceProvisionDetail[]; total: Prisma.Decimal }[] = [
      { type: 'RENT', nomenclature: 'Найм', commentLabel: 'Найм услуги', details: rent.details, total: rent.total },
      { type: 'UTILITIES', nomenclature: 'Коммуналка', commentLabel: 'Коммунальные услуги', details: utilities.details, total: utilities.total },
    ];

    const items: AccountingServiceProvisionPush[] = [];
    for (const spec of specs) {
      if (spec.details.length === 0) continue;

      const rawPayloadBase = {
        // 1-е число ЦЕЛЕВОГО месяца, не текущая дата прогона — так в реальном примере
        // запроса от 2026-09-04 (документ за сентябрь → "2026-09-01"), не конец месяца.
        Date: formatDateOnlyIso(monthStart),
        NomenclatureType: spec.nomenclature,
        DocumentSumm: Number(spec.total),
        Comment: `HostelRosNOUWeb | ${spec.commentLabel} | ${monthLabel}`,
        DocumentSummDetails: spec.details,
      };

      // upsert — пересчитывается на каждый вызов (в т.ч. на каждую загрузку страницы, см.
      // выше), а не только один раз при первой отправке: если состав/суммы начислений
      // изменились (например поправили adjustmentAmount) до реальной отправки в 1С —
      // сотрудник видит актуальные цифры, а не то, что было посчитано месяц назад.
      // accounting1cDocumentUid/accounting1cSyncStatus в update НЕ трогаем — их меняет
      // только реальный результат отправки (run() ниже), пересчёт суммы сам по себе не
      // должен тихо откатывать уже подтверждённый статус SYNCED на прежний.
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
        },
      });

      items.push({
        SiteDocumentID: row.id,
        ...rawPayloadBase,
        DocumentUID: row.accounting1cDocumentUid ?? undefined,
      });
    }

    return { items };
  }

  // Отправка в 1С — уже посчитанных (см. computeAndSave выше) документов за целевой месяц.
  // Дёргается ночным кроном и кнопкой "Отправить" на странице.
  async run(targetMonth: Date = addMonths(new Date(), -1)): Promise<{ pushed: number; succeeded: number; failed: number; skipped: boolean }> {
    const { items } = await this.computeAndSave(targetMonth);
    if (items.length === 0) {
      return { pushed: 0, succeeded: 0, failed: 0, skipped: true };
    }
    if (!this.provider.isServiceProvisionConfigured()) {
      this.logger.warn('1С Бухгалтерия (оказание услуг) не настроена — пропуск отправки');
      return { pushed: 0, succeeded: 0, failed: 0, skipped: true };
    }

    let results: Awaited<ReturnType<Accounting1cProvider['pushServiceProvisionDocs']>>;
    try {
      results = await this.provider.pushServiceProvisionDocs(items);
    } catch (error) {
      if (error instanceof Accounting1cNotConfiguredError) return { pushed: 0, succeeded: 0, failed: 0, skipped: true };
      // Сеть/сервис недоступны целиком — статусы строк не трогаем (остаются в прежнем
      // состоянии — NOT_SYNCED при первой попытке, или прежний статус при повторе),
      // следующий месячный прогон (или будущий ручной повтор) попробует заново.
      this.logger.error(`Не удалось отправить документы "оказание услуг" в 1С: ${getErrorMessage(error)}`);
      return { pushed: items.length, succeeded: 0, failed: 0, skipped: false };
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

    this.logger.log(`Оказание услуг за ${targetMonth.toISOString().slice(0, 7)}: отправлено документов ${items.length}, успешно ${succeeded}, ошибок ${failed}`);
    return { pushed: items.length, succeeded, failed, skipped: false };
  }
}
