import { BadGatewayException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { ContractApprovalService } from './contract-approval.service';

const user = { id: 7, fullName: 'Сотрудник' } as never;

function setup(contractorUid: string | null, contractUid: string | null) {
  const contract = {
    id: 12,
    number: 'ОП 12',
    contractDate: new Date('2026-10-15T00:00:00.000Z'),
    residentIndividualUid: 'person-uid',
    status: 'ACTIVE',
    accounting1cUid: contractUid,
    resident: { fizicheskoyeLitsoUid: 'person-uid', fullName: 'Иванов Иван', accounting1cContractorUid: contractorUid },
    terms: [{ rentAmount: new Prisma.Decimal(7000) }],
  };
  const tx = {
    user: { upsert: jest.fn().mockResolvedValue({}) },
    individual: { update: jest.fn().mockImplementation(async () => {
      contract.resident.accounting1cContractorUid = 'contractor-1';
      return { accounting1cContractorUid: 'contractor-1' };
    }) },
    contract: { update: jest.fn().mockImplementation(async () => {
      contract.accounting1cUid = 'contract-1';
      return { accounting1cUid: 'contract-1' };
    }) },
  };
  const prisma = {
    contract: { findUnique: jest.fn().mockResolvedValue(contract) },
    syncLock: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const accounting = {
    isContractorCreateConfigured: jest.fn().mockReturnValue(true),
    isContractCreateConfigured: jest.fn().mockReturnValue(true),
    createContractors: jest.fn().mockResolvedValue([{ ContractorID: 'person-uid', ContractorUID: 'contractor-1', FinalStatus: true }]),
    createContracts: jest.fn().mockResolvedValue([{ DogovorID: 12, ContractUID: 'contract-1', FinalStatus: true }]),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { contract, tx, prisma, accounting, audit, service: new ContractApprovalService(prisma as never, audit as never, accounting as never) };
}

describe('ContractApprovalService', () => {
  it('creates the missing contractor before the contract with the agreed payload', async () => {
    const { service, accounting, tx, prisma } = setup(null, null);

    await service.approve(12, user);

    expect(accounting.createContractors).toHaveBeenCalledWith([{ ContractorID: 'person-uid', ContractorFIO: 'Иванов Иван' }]);
    expect(accounting.createContracts).toHaveBeenCalledWith([{
      DogovorID: 12,
      ContractName: 'ОП 12',
      ContractDate: '2026-10-15T00:00:00',
      DocumentSummNaim: 7000,
      ContractorUID: 'contractor-1',
    }]);
    expect(tx.individual.update).toHaveBeenCalledTimes(1);
    expect(tx.contract.update).toHaveBeenCalledTimes(1);
    expect(prisma.syncLock.deleteMany).toHaveBeenCalled();
  });

  it('does not send anything when both 1C UIDs are already saved', async () => {
    const { service, accounting } = setup('contractor-1', 'contract-1');

    await service.approve(12, user);

    expect(accounting.createContractors).not.toHaveBeenCalled();
    expect(accounting.createContracts).not.toHaveBeenCalled();
  });

  it('keeps a created contractor after contract failure and skips creating it on retry', async () => {
    const { service, accounting, tx } = setup(null, null);
    accounting.createContracts.mockResolvedValueOnce([{ DogovorID: 12, FinalStatus: false, ERROR: 'Ошибка 1С' }]);

    await expect(service.approve(12, user)).rejects.toBeInstanceOf(BadGatewayException);
    await service.approve(12, user);

    expect(tx.individual.update).toHaveBeenCalledTimes(1);
    expect(accounting.createContractors).toHaveBeenCalledTimes(1);
    expect(accounting.createContracts).toHaveBeenCalledTimes(2);
  });

  it('does not create a contract when 1C rejects the contractor', async () => {
    const { service, accounting, tx } = setup(null, null);
    accounting.createContractors.mockResolvedValueOnce([{ ContractorID: 'person-uid', FinalStatus: false, ERROR: 'Ошибка контрагента' }]);

    await expect(service.approve(12, user)).rejects.toBeInstanceOf(BadGatewayException);

    expect(accounting.createContracts).not.toHaveBeenCalled();
    expect(tx.individual.update).not.toHaveBeenCalled();
  });
});
