import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_1C_PROVIDER, type Accounting1cProvider } from '../accounting-1c/accounting-1c.types';
import { parsePaymentImportCandidate } from './payment-import-candidate';
import { suggestContractMatch } from './suggest-contract-match';
import { getErrorMessage } from '../sync/sync.errors';

// Флоу 2 (см. промпт проекта) — раз в сутки забирает из 1С платежи, пришедшие мимо сайта
// (касса/перевод/по реквизитам), и кладёт их в PaymentImportRecord как есть (rawPayload),
// с предложением договора (suggestedContractId, НЕ решение — см. suggest-contract-match.ts).
// Настоящий Payment создаётся только через явное подтверждение сотрудника
// (payment-imports.controller.ts#approve), не здесь.
@Injectable()
export class PaymentImportsIngestService {
  private readonly logger = new Logger(PaymentImportsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly provider: Accounting1cProvider,
  ) {}

  async ingest(): Promise<{ fetched: number; imported: number; skippedExisting: number }> {
    if (!this.provider.isFetchConfigured()) {
      this.logger.warn('Получение платежей из 1С не настроено — пропуск импорта');
      return { fetched: 0, imported: 0, skippedExisting: 0 };
    }

    let rawItems: Awaited<ReturnType<Accounting1cProvider['fetchPayments']>>;
    try {
      rawItems = await this.provider.fetchPayments();
    } catch (error) {
      this.logger.error(`Не удалось получить платежи из 1С: ${getErrorMessage(error)}`);
      return { fetched: 0, imported: 0, skippedExisting: 0 };
    }
    if (rawItems.length === 0) return { fetched: 0, imported: 0, skippedExisting: 0 };

    let imported = 0;
    let skippedExisting = 0;
    for (const raw of rawItems) {
      const candidate = parsePaymentImportCandidate(raw);
      const existing = await this.prisma.paymentImportRecord.findUnique({
        where: { source_externalId: { source: '1C', externalId: candidate.externalId } },
      });
      if (existing) {
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
