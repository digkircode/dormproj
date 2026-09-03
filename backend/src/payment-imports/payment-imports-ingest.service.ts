import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_1C_PROVIDER, type Accounting1cProvider, type AccountingContractPair } from '../accounting-1c/accounting-1c.types';
import { parsePaymentImportCandidate } from './payment-import-candidate';
import { suggestContractMatch } from './suggest-contract-match';
import { getErrorMessage } from '../sync/sync.errors';

// Флоу 2 (см. промпт проекта) — раз в сутки забирает из 1С платежи, пришедшие мимо сайта
// (касса/перевод/по реквизитам), и кладёт их в PaymentImportRecord как есть (rawPayload),
// с предложением договора (suggestedContractId, НЕ решение — см. suggest-contract-match.ts).
// Настоящий Payment создаётся только через явное подтверждение сотрудника
// (payment-imports.controller.ts#approve), не здесь.
//
// AllPaymentDoc (реальный пример 2026-09-04) не отдаёт общую ленту "нового" — только
// платежи по явно перечисленным парам ContractorUID/ContractUID, поэтому сначала
// собираем эти пары из наших же данных (см. collectKnownPairs ниже). Практическое
// следствие: опросить можно только договоры, для которых обе стороны пары УЖЕ известны
// (обычно — был хотя бы один платёж через эквайринг, см. Individual.accounting1cContractorUid/
// Contract.accounting1cUid) — договор, где резидент никогда не платил онлайн, этим
// путём не найти, у нас просто нет пары, по которой его спросить.
@Injectable()
export class PaymentImportsIngestService {
  private readonly logger = new Logger(PaymentImportsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly provider: Accounting1cProvider,
  ) {}

  private async collectKnownPairs(): Promise<AccountingContractPair[]> {
    const contracts = await this.prisma.contract.findMany({
      where: { accounting1cUid: { not: null }, resident: { accounting1cContractorUid: { not: null } } },
      select: { accounting1cUid: true, resident: { select: { accounting1cContractorUid: true } } },
    });
    return contracts.map((c) => ({
      contractorUid: c.resident.accounting1cContractorUid!,
      contractUid: c.accounting1cUid!,
    }));
  }

  async ingest(): Promise<{ fetched: number; imported: number; skippedExisting: number }> {
    if (!this.provider.isFetchConfigured()) {
      this.logger.warn('Получение платежей из 1С не настроено — пропуск импорта');
      return { fetched: 0, imported: 0, skippedExisting: 0 };
    }

    const pairs = await this.collectKnownPairs();
    if (pairs.length === 0) {
      this.logger.log('Импорт платежей из 1С: нет ни одного договора с известной парой ContractorUID/ContractUID — нечего спрашивать');
      return { fetched: 0, imported: 0, skippedExisting: 0 };
    }

    let rawItems: Awaited<ReturnType<Accounting1cProvider['fetchPayments']>>;
    try {
      rawItems = await this.provider.fetchPayments(pairs);
    } catch (error) {
      this.logger.error(`Не удалось получить платежи из 1С: ${getErrorMessage(error)}`);
      return { fetched: 0, imported: 0, skippedExisting: 0 };
    }
    if (rawItems.length === 0) return { fetched: 0, imported: 0, skippedExisting: 0 };

    // AllPaymentDoc отдаёт ПОЛНУЮ историю по каждой запрошенной паре, а не только новое
    // (см. комментарий выше) — значит в rawItems КАЖДЫЙ раз попадают и платежи, которые
    // МЫ САМИ уже отправили в 1С через эквайринг (флоу 1, push). У них есть DocumentUID
    // (Payment.accounting1cDocumentUid) — тот же самый, что здесь придёт как externalId.
    // Без проверки против Payment (не только против PaymentImportRecord) такой платёж
    // заводился бы как "новый" на разбор — а если сотрудник его по ошибке одобрит,
    // получится дублирующий Payment на уже учтённые деньги. Обе проверки — одним
    // батчем (не по одному findUnique на строку): при полной истории по всем известным
    // договорам счёт может пойти на тысячи строк каждый день, а не на единицы.
    const candidates = rawItems.map((raw) => ({ raw, candidate: parsePaymentImportCandidate(raw) }));
    const externalIds = candidates.map((c) => c.candidate.externalId);
    const [existingImports, ownPushedPayments] = await Promise.all([
      this.prisma.paymentImportRecord.findMany({ where: { source: '1C', externalId: { in: externalIds } }, select: { externalId: true } }),
      this.prisma.payment.findMany({ where: { accounting1cDocumentUid: { in: externalIds } }, select: { accounting1cDocumentUid: true } }),
    ]);
    const knownIds = new Set<string>([
      ...existingImports.map((r) => r.externalId),
      ...ownPushedPayments.map((p) => p.accounting1cDocumentUid!),
    ]);

    let imported = 0;
    let skippedExisting = 0;
    for (const { raw, candidate } of candidates) {
      if (knownIds.has(candidate.externalId)) {
        skippedExisting++;
        continue;
      }

      const suggestedContractId = await suggestContractMatch(this.prisma, candidate);
      await this.prisma.paymentImportRecord.create({
        data: {
          source: '1C',
          externalId: candidate.externalId,
          rawPayload: raw as object,
          status: 'NEEDS_REVIEW',
          suggestedContractId,
        },
      });
      imported++;
    }

    this.logger.log(`Импорт платежей из 1С: получено ${rawItems.length}, новых ${imported}, уже были ${skippedExisting}`);
    return { fetched: rawItems.length, imported, skippedExisting };
  }
}
