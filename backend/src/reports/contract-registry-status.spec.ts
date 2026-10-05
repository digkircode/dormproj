import { contractRegistryStatusAtDate } from './contract-registry-status';

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

describe('contract registry status on a historical date', () => {
  it('shows an active contract outside the 30-day window', () => {
    const contract = { status: 'COMPLETED' as const, endDate: day(40), actualEndDate: null };
    expect(contractRegistryStatusAtDate(contract, day(1), 0)).toBe('ACTIVE');
  });

  it('uses the 30-day window and keeps the end date inclusive', () => {
    const contract = { status: 'COMPLETED' as const, endDate: day(30), actualEndDate: null };
    expect(contractRegistryStatusAtDate(contract, day(1), 0)).toBe('EXPIRING');
    expect(contractRegistryStatusAtDate(contract, day(30), 0)).toBe('EXPIRING');
    expect(contractRegistryStatusAtDate(contract, day(31), 0)).toBe('COMPLETED');
  });

  it('distinguishes overdue and completed using the balance on the selected date', () => {
    const contract = { status: 'COMPLETED' as const, endDate: day(10), actualEndDate: null };
    expect(contractRegistryStatusAtDate(contract, day(11), 120)).toBe('OVERDUE');
    expect(contractRegistryStatusAtDate(contract, day(11), 0)).toBe('COMPLETED');
    expect(contractRegistryStatusAtDate(contract, day(11), -20)).toBe('COMPLETED');
  });

  it('does not show a later termination on an earlier date', () => {
    const contract = { status: 'TERMINATED' as const, endDate: day(30), actualEndDate: day(20) };
    expect(contractRegistryStatusAtDate(contract, day(19), 0)).toBe('EXPIRING');
    expect(contractRegistryStatusAtDate(contract, day(20), 0)).toBe('TERMINATED');
  });
});
