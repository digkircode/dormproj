import { Prisma } from '../../generated/prisma/client.js';

const RESIDENT_ROLE_NAME = 'RESIDENT';

// Роль "Проживающий" (RESIDENT) следует ИСКЛЮЧИТЕЛЬНО за фактом реального проживания —
// ДЕЙСТВУЮЩИЙ (ACTIVE) договор с активным заселением в комнату (roomAssignment без
// toDate). Тот же критерий "текущих проживающих", что уже используется для фильтров
// рассылки чата (см. chats/chat-recipients.ts#currentResidents) — держим оба места в
// одном понятии, не расходимся.
// **Присутствие в Student (контингент вуза, из 1С) БОЛЬШЕ НЕ УЧИТЫВАЕТСЯ (убрано
// 2026-08-24, по прямой просьбе)** — это было исходным и до недавнего момента ЕДИНСТВЕННЫМ
// критерием (см. историю ниже), но подавляющее большинство студентов вуза в общежитии не
// проживает — Student отвечает на вопрос "числится ли человек студентом", не "живёт ли он
// здесь". Раньше это давало ложные срабатывания (роль/доступ к разделу "Проживающий" —
// чат, "Информация о договоре" — у произвольного студента без всякого отношения к
// общежитию). Правильный признак — то же самое "живёт здесь прямо сейчас", что уже
// закреплено в chatRecipients выше.
// **История критерия (не доверяй более старым описаниям буквально):** первая версия
// (2026-08-23) — только Student. Раунд 2026-08-24 (днём) добавил ВТОРОЙ признак —
// действующий договор — в ДОПОЛНЕНИЕ к Student (объединение), закрывая пробел с вручную
// заведёнными физлицами (Individual.isManual), которые никогда не попадут в Student, но
// проживают по настоящему договору. Тем же вечером Student убран совсем — итоговый и
// единственный критерий теперь один, независимо от происхождения физлица (синхронное или
// ручное) и независимо от того, студент человек вуза или нет.
// **Важное следствие смены критерия** — при развёртывании этой версии часть аккаунтов,
// у которых роль держалась ТОЛЬКО на присутствии в Student (без активного договора в
// системе — например студент, который живёт в общежитии по данным вне системы, но
// договор на него ещё не заведён/не актуализирован), при ближайшем логине/ночном синке
// ПОТЕРЯЕТ роль RESIDENT. Это ожидаемо и осознанно (студент без активного договора в
// системе — по определению не тот, кому сейчас нужен доступ к разделу "Проживающий"), но
// стоит держать в голове, если после этой правки кто-то пожалуется на пропавший доступ —
// решение: завести/актуализировать договор, не возвращать критерий Student.
// Два места вызова (по прямой просьбе 2026-08-23): после полного синка студентов
// (sync.service.ts#runSync, имя вызова осталось прежним, хотя сам Student уже не
// участвует в расчёте — пересчёт всё равно нужен, т.к. полный синк меняет и Individual/
// Room-данные, влияющие на активные договоры) — массово, и при каждом логине через
// rosnou-id (auth.controller.ts) — точечно, только для залогинившегося. Создание/
// расторжение договора эту функцию НЕ дёргает — эффект проявится на ближайшем логине
// резидента или ночном синке, тот же принцип задержки, что был и раньше.
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
  // Активное заселение — roomAssignments с toDate:null (ещё не закрыто), тот же признак,
  // что currentResidents() в chat-recipients.ts. Полный billing-расчёт (buildDebtorRows)
  // тут не нужен — только сам факт "прямо сейчас где-то живёт".
  const activeResidentContracts = await prisma.contract.findMany({
    where: { residentIndividualUid: { in: uids }, status: 'ACTIVE', roomAssignments: { some: { toDate: null } } },
    select: { residentIndividualUid: true },
    distinct: ['residentIndividualUid'],
  });
  const activeResidentUidSet = new Set(activeResidentContracts.map((c) => c.residentIndividualUid));

  let granted = 0;
  let revoked = 0;
  for (const user of users) {
    const isResident = user.univerId !== null && activeResidentUidSet.has(user.univerId);
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
