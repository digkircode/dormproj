import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentImportCandidate } from './payment-import-candidate';

export async function suggestContractMatch(prisma: PrismaService, candidate: PaymentImportCandidate): Promise<number | null> {
  if (!candidate.contractUid || !candidate.contractorUid) return null;
  const contracts = await prisma.contract.findMany({
    where: {
      accounting1cUid: candidate.contractUid,
      resident: { accounting1cContractorUid: candidate.contractorUid },
    },
    select: { id: true },
    take: 2,
  });
  return contracts.length === 1 ? contracts[0]!.id : null;
}
