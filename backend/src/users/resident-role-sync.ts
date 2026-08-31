import { Prisma } from '../../generated/prisma/client.js';

const RESIDENT_ROLE_NAME = 'RESIDENT';
const GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Роль "Проживающий" (RESIDENT) следует ИСКЛЮЧИТЕЛЬНО за фактом реального проживания —
// на 2026-08-31 это уже не "ACTIVE-договор с активным заселением" (см. историю ниже), а
// прямой разбор жизненного цикла ДОГОВОРА (ContractStatus, см. schema.prisma):
// - есть хоть один договор со статусом ACTIVE/EXPIRING (т.е. срок ещё не вышел) → роль есть,
//   независимо от статуса остальных договоров этого же человека;
// - иначе смотрим на самый поздний по дате окончания договор среди TERMINATED/COMPLETED/
//   OVERDUE (дата окончания — actualEndDate, если есть, иначе endDate):
//   - TERMINATED → роль снимается СРАЗУ, без отсрочки (это осознанное решение сотрудника,
//     принятое с полным знанием ситуации — в отличие от естественного истечения срока);
//   - COMPLETED/OVERDUE (естественное завершение, никто не расторгал) → роль снимается
//     только через GRACE_PERIOD_DAYS (30) дней после даты окончания — сотрудник может
//     не успеть завести продлевающий договор день в день, роль не должна пропадать раньше
//     этого срока.
// Проверка "не осталось ли других договоров" зашита в сам порядок проверок выше: прежде
// чем решать по TERMINATED/COMPLETED/OVERDUE, мы уже убедились, что нет ни одного
// ACTIVE/EXPIRING договора у этого же человека.
// **Roomassignment (активное заселение) в критерии больше НЕ участвует** — раньше это был
// доп. фильтр поверх ACTIVE-статуса; жизненный цикл статуса договора теперь сам по себе
// достаточен и точнее отражает "формально ли ещё действует договор", чем факт открытого
// заселения (переезд/техническая правка заселения не должны сами по себе гасить роль).
// **История критерия (не доверяй более старым описаниям буквально):** первая версия
// (2026-08-23) — только присутствие в Student (контингент вуза из 1С). Раунд 2026-08-24
// (днём) добавил ВТОРОЙ признак — действующий договор — в ДОПОЛНЕНИЕ к Student, закрывая
// пробел с вручную заведёнными физлицами (Individual.isManual). Тем же вечером Student
// убран совсем (давал ложные срабатывания — числится студентом ≠ живёт здесь). С этого
// момента и до 2026-08-31 единственным критерием был ACTIVE-статус + открытое заселение.
// 2026-08-31: добавлены реальные статусы EXPIRING/OVERDUE/COMPLETED в ContractStatus (см.
// contract-status.scheduler.ts) — простой "status==='ACTIVE'" перестал бы работать для
// договоров, которые формально ещё никто не выселял, но крон уже перевёл в EXPIRING/
// OVERDUE/COMPLETED; переписан на разбор жизненного цикла выше.
// Два места вызова (как и раньше): после полного синка студентов (sync.service.ts#runSync,
// имя вызова осталось прежним) — массово, и при каждом логине через rosnou-id
// (auth.controller.ts) — точечно, только для залогинившегося. Создание/расторжение
// договора эту функцию НЕ дёргает — эффект проявится на ближайшем логине резидента или
// ночном синке, тот же принцип задержки, что был и раньше.
// Не трогает остальные роли (STAFF/ADMIN и кастомные) — только строку RESIDENT в users_roles.
export async function syncResidentRoles(
  prisma: Prisma.TransactionClient,
  options?: { userId?: number },
): Promise<{ granted: number; revoked: number }> {
  const residentRole = await prisma.role.findUnique({ where: { name: RESIDENT_ROLE_NAME } });
  if (!residentRole) return { granted: 0, revoked: 0 };

  const users = await prisma.user.findMany({
    where: { univerId: { not: null }, ...(options?.userId ? { id: options.userId } : {}) },
    select: { id: true, univerId: true, roles: { where: { roleId: residentRole.id }, select: { roleId: true } } },
  });
  if (users.length === 0) return { granted: 0, revoked: 0 };

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
    if (latest.status === 'TERMINATED') return false;

    const daysSinceEnd = (now - effectiveEnd(latest).getTime()) / MS_PER_DAY;
    return daysSinceEnd <= GRACE_PERIOD_DAYS;
  }

  let granted = 0;
  let revoked = 0;
  for (const user of users) {
    const isResident = user.univerId !== null && shouldHaveResidentRole(user.univerId);
    const hasResident = user.roles.length > 0;
    if (isResident && !hasResident) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: residentRole.id } });
      granted++;
    } else if (!isResident && hasResident) {
      await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: residentRole.id } });
      revoked++;
    }
  }
  return { granted, revoked };
}
