import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_1C_PROVIDER, type Accounting1cProvider, type AccountingContractPair } from '../accounting-1c/accounting-1c.types';
import { parsePaymentImportCandidate } from './payment-import-candidate';
import { suggestContractMatch } from './suggest-contract-match';
import { getErrorMessage } from '../sync/sync.errors';

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

  async ingest(): Promise<{ fetched: number; imported: number; skippedExisting: number; errorMessage?: string; knownPairs?: number }> {
    if (!this.provider.isFetchConfigured()) {
      this.logger.warn('Получение платежей из 1С не настроено - пропуск импорта');
      return { fetched: 0, imported: 0, skippedExisting: 0, errorMessage: 'Получение платежей из 1С не настроено' };
    }

    const pairs = await this.collectKnownPairs();
    if (pairs.length === 0) {
      this.logger.log('Импорт платежей из 1С: нет ни одного договора с известной парой ContractorUID/ContractUID - нечего спрашивать');
      return { fetched: 0, imported: 0, skippedExisting: 0, knownPairs: 0 };
    }

    let rawItems: Awaited<ReturnType<Accounting1cProvider['fetchPayments']>>;
    try {
      rawItems = await this.provider.fetchPayments(pairs);
    } catch (error) {
      this.logger.error(`Не удалось получить платежи из 1С: ${getErrorMessage(error)}`);
      return { fetched: 0, imported: 0, skippedExisting: 0, knownPairs: pairs.length, errorMessage: getErrorMessage(error) };
    }
    if (rawItems.length === 0) return { fetched: 0, imported: 0, skippedExisting: 0, knownPairs: pairs.length };

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
      if (!suggestedContractId) {
        this.logger.warn('Пропущен документ 1С: пара UID не соответствует единственному договору');
        continue;
      }
      await this.prisma.paymentImportRecord.create({
        data: {
          source: '1C',
          externalId: candidate.externalId,
          rawPayload: raw as object,
          status: 'NEEDS_REVIEW',
          suggestedContractId,
        },
      });
      knownIds.add(candidate.externalId);
      imported++;
    }

    this.logger.log(`Импорт платежей из 1С: получено ${rawItems.length}, новых ${imported}, уже были ${skippedExisting}`);
    return { fetched: rawItems.length, imported, skippedExisting, knownPairs: pairs.length };
  }
}
