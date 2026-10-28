import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ensureUserRecord } from '../users/ensure-user';
import type { SessionUser } from '../auth/types';
import { ACCOUNTING_1C_PROVIDER, type Accounting1cProvider } from '../accounting-1c/accounting-1c.types';
import { formatDateOnlyIso } from '../billing/build-accounting-payment-payload';

const LOCK_STALE_MS = 10 * 60_000;

@Injectable()
export class ContractApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly accounting: Accounting1cProvider,
  ) {}

  private async acquireLock(type: string): Promise<void> {
    try {
      await this.prisma.syncLock.create({ data: { type } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
      const deleted = await this.prisma.syncLock.deleteMany({ where: { type, startedAt: { lt: staleBefore } } });
      if (deleted.count === 0) throw new ConflictException('Утверждение договора уже выполняется');
      try {
        await this.prisma.syncLock.create({ data: { type } });
      } catch (raceError) {
        if (raceError instanceof Prisma.PrismaClientKnownRequestError && raceError.code === 'P2002') {
          throw new ConflictException('Утверждение договора уже выполняется');
        }
        throw raceError;
      }
    }
  }

  async approve(contractId: number, user: SessionUser): Promise<void> {
    const owner = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { residentIndividualUid: true } });
    if (!owner) throw new NotFoundException('Договор не найден');
    const lockType = `accounting-approval:${owner.residentIndividualUid}`;
    await this.acquireLock(lockType);
    try {
      await this.approveLocked(contractId, user);
    } finally {
      await this.prisma.syncLock.deleteMany({ where: { type: lockType } });
    }
  }

  private async approveLocked(contractId: number, user: SessionUser): Promise<void> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        resident: { select: { fizicheskoyeLitsoUid: true, fullName: true, accounting1cContractorUid: true } },
        terms: { orderBy: { validFrom: 'asc' }, take: 1, select: { rentAmount: true } },
      },
    });
    if (!contract) throw new NotFoundException('Договор не найден');
    if (contract.status === 'TERMINATED') throw new BadRequestException('Расторгнутый договор нельзя утвердить');
    if (contract.accounting1cUid && contract.resident.accounting1cContractorUid) return;
    if (!contract.accounting1cUid && !contract.terms[0]) throw new BadRequestException('У договора нет условий найма');
    if (!contract.resident.accounting1cContractorUid && !this.accounting.isContractorCreateConfigured()) {
      throw new ServiceUnavailableException('Не настроен адрес создания контрагента в 1С Бухгалтерии');
    }
    if (!contract.accounting1cUid && !this.accounting.isContractCreateConfigured()) {
      throw new ServiceUnavailableException('Не настроен адрес создания договора в 1С Бухгалтерии');
    }

    let contractorUid = contract.resident.accounting1cContractorUid;
    if (!contractorUid) {
      const results = await this.accounting.createContractors([{
        ContractorID: contract.resident.fizicheskoyeLitsoUid,
        ContractorFIO: contract.resident.fullName,
      }]);
      const result = results.find((row) => row.ContractorID === contract.resident.fizicheskoyeLitsoUid);
      if (result?.FinalStatus !== true || !result.ContractorUID?.trim()) {
        throw new BadGatewayException(result?.ERROR || '1С не подтвердила создание контрагента');
      }
      contractorUid = result.ContractorUID.trim();
      await this.prisma.$transaction(async (tx) => {
        const userId = await ensureUserRecord(tx, user);
        const updated = await tx.individual.update({
          where: { fizicheskoyeLitsoUid: contract.residentIndividualUid },
          data: { accounting1cContractorUid: contractorUid },
        });
        await this.auditLog.log(tx, {
          userId, action: 'UPDATE', entityType: 'Individual', entityId: contract.residentIndividualUid,
          entityLabel: `Утверждение договора: ${contract.resident.fullName}`,
          before: contract.resident, after: updated, fields: ['accounting1cContractorUid'],
        });
      });
    }

    if (contract.accounting1cUid) return;
    const results = await this.accounting.createContracts([{
      DogovorID: contract.id,
      ContractName: contract.number,
      ContractDate: formatDateOnlyIso(contract.contractDate),
      DocumentSummNaim: Number(contract.terms[0].rentAmount),
      ContractorUID: contractorUid,
    }]);
    const result = results.find((row) => row.DogovorID === contract.id);
    if (result?.FinalStatus !== true || !result.ContractUID?.trim()) {
      throw new BadGatewayException(result?.ERROR || '1С не подтвердила создание договора');
    }
    await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, user);
      const updated = await tx.contract.update({ where: { id: contract.id }, data: { accounting1cUid: result.ContractUID!.trim() } });
      await this.auditLog.log(tx, {
        userId, action: 'UPDATE', entityType: 'Contract', entityId: contract.id,
        entityLabel: `Утверждение договора №${contract.number}`,
        before: contract, after: updated, fields: ['accounting1cUid'],
      });
    });
  }
}
