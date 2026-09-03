import { PrismaService } from '../prisma/prisma.service';
import type { PaymentImportCandidate } from './payment-import-candidate';

// Только ПРЕДЛОЖЕНИЕ, не решение (см. suggestedContractId в schema.prisma) — сотрудник
// подтверждает или меняет вручную на странице разбора, даже если совпадение выглядит
// однозначным (человеческий фактор — не тот контрагент/договор/сумма, по прямой просьбе
// 2026-09-03 полного автоматического одобрения сознательно нет).
// Порядок приоритета: ContractUID (точнее всего — конкретный договор) → ContractorUID
// (человек известен, берём его САМЫЙ СВЕЖИЙ договор — не обязательно тот, по которому
// платили) → ФИО контрагента (грубый fallback, ILIKE, тоже самый свежий договор). Если
// ничего не нашлось — null, сотрудник ищет договор с нуля.
export async function suggestContractMatch(prisma: PrismaService, candidate: PaymentImportCandidate): Promise<number | null> {
  if (candidate.contractUid) {
    const byContractUid = await prisma.contract.findFirst({
      where: { accounting1cUid: candidate.contractUid },
      select: { id: true },
    });
    if (byContractUid) return byContractUid.id;
  }

  if (candidate.contractorUid) {
    const byContractorUid = await prisma.contract.findFirst({
      where: { resident: { accounting1cContractorUid: candidate.contractorUid } },
      orderBy: { contractDate: 'desc' },
      select: { id: true },
    });
    if (byContractorUid) return byContractorUid.id;
  }

  if (candidate.contractorFio) {
    const byFio = await prisma.contract.findFirst({
      where: { resident: { fullName: { equals: candidate.contractorFio, mode: 'insensitive' } } },
      orderBy: { contractDate: 'desc' },
      select: { id: true },
    });
    if (byFio) return byFio.id;
  }

  return null;
}
