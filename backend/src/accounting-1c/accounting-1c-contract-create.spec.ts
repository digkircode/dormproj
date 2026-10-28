import { of } from 'rxjs';
import { Accounting1cPaymentsProvider } from './accounting-1c-payments.provider';

describe('1C contract creation endpoints', () => {
  it('posts separate arrays for the contractor and contract with Basic auth', async () => {
    const values: Record<string, string> = {
      ACCOUNTING_1C_LOGIN: 'user',
      ACCOUNTING_1C_PASSWORD: 'password',
      ACCOUNTING_1C_CONTRACTOR_CREATE_URL: 'http://example.test/ContractorCreate',
      ACCOUNTING_1C_CONTRACT_CREATE_URL: 'http://example.test/ContractCreate',
    };
    const config = { get: jest.fn((key: string) => values[key]) };
    const post = jest.fn()
      .mockReturnValueOnce(of({ data: [{ ContractorID: 'person-1', ContractorUID: 'uid-1', FinalStatus: true }] }))
      .mockReturnValueOnce(of({ data: [{ DogovorID: 3, ContractUID: 'uid-2', FinalStatus: true }] }));
    const provider = new Accounting1cPaymentsProvider({ post } as never, config as never);
    const contractor = [{ ContractorID: 'person-1', ContractorFIO: 'Иванов Иван' }];
    const contract = [{ DogovorID: 3, ContractName: 'ОП 3', ContractDate: '2026-10-28T00:00:00', DocumentSummNaim: 7000, ContractorUID: 'uid-1' }];

    await expect(provider.createContractors(contractor)).resolves.toEqual([{ ContractorID: 'person-1', ContractorUID: 'uid-1', FinalStatus: true }]);
    await expect(provider.createContracts(contract)).resolves.toEqual([{ DogovorID: 3, ContractUID: 'uid-2', FinalStatus: true }]);

    expect(post).toHaveBeenNthCalledWith(1, values.ACCOUNTING_1C_CONTRACTOR_CREATE_URL, contractor, expect.objectContaining({ auth: { username: 'user', password: 'password' } }));
    expect(post).toHaveBeenNthCalledWith(2, values.ACCOUNTING_1C_CONTRACT_CREATE_URL, contract, expect.objectContaining({ auth: { username: 'user', password: 'password' } }));
  });
});
