import { Prisma } from '../../generated/prisma/client.js';

const RESIDENT_ROLE_NAME = 'RESIDENT';
const GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function syncResidentRoles(
  prisma: Prisma.TransactionClient,
  options?: { userId?: number; individualUid?: string },
): Promise<{ processed: number; granted: number; revoked: number }> {
  const residentRole = await prisma.role.findUnique({ where: { name: RESIDENT_ROLE_NAME } });
  if (!residentRole) throw new Error('Роль RESIDENT не настроена');

  const users = await prisma.user.findMany({
    where: options?.userId !== undefined ? { id: options.userId }
      : options?.individualUid ? { univerId: options.individualUid }
        : { OR: [{ univerId: { not: null } }, { roles: { some: { roleId: residentRole.id } } }] },
    select: { id: true, univerId: true, roles: { where: { roleId: residentRole.id }, select: { roleId: true } } },
  });
  if (users.length === 0) return { processed: 0, granted: 0, revoked: 0 };

  const uids = [...new Set(users.map((u) => u.univerId).filter((uid): uid is string => uid !== null))];
  const contracts = await prisma.contract.findMany({
    where: { residentIndividualUid: { in: uids } },
    select: { residentIndividualUid: true, status: true, endDate: true, actualEndDate: true },
  });

  const contractsByUid = new Map<string, typeof contracts>();
  for (const contract of contracts) {
    const list = contractsByUid.get(contract.residentIndividualUid);
    if (list) list.push(contract);
    else contractsByUid.set(contract.residentIndividualUid, [contract]);
  }

  const now = Date.now();
  function effectiveEnd(contract: { endDate: Date; actualEndDate: Date | null }): Date {
    return contract.actualEndDate ?? contract.endDate;
  }
  function shouldHaveResidentRole(uid: string): boolean {
    const list = contractsByUid.get(uid);
    if (!list || list.length === 0) return false;
    if (list.some((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING')) return true;

    const ended = list.filter((c) => c.status === 'TERMINATED' || c.status === 'COMPLETED' || c.status === 'OVERDUE');
    if (ended.length === 0) return false;
    const latest = ended.reduce((a, b) => (effectiveEnd(b) > effectiveEnd(a) ? b : a));

    const daysSinceEnd = (now - effectiveEnd(latest).getTime()) / MS_PER_DAY;
    return daysSinceEnd <= GRACE_PERIOD_DAYS;
  }

  let granted = 0;
  let revoked = 0;
  for (const user of users) {
    const isResident = user.univerId !== null && shouldHaveResidentRole(user.univerId);
    const hasResident = user.roles.length > 0;
    if (isResident && !hasResident) {
      const result = await prisma.userRole.createMany({ data: [{ userId: user.id, roleId: residentRole.id }], skipDuplicates: true });
      granted += result.count;
    } else if (!isResident && hasResident) {
      const result = await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: residentRole.id } });
      revoked += result.count;
    }
  }
  return { processed: users.length, granted, revoked };
}
