import { Prisma } from '../../generated/prisma/client.js';

const RESIDENT_ROLE_NAME = 'RESIDENT';

// Роль "Проживающий" (RESIDENT) следует за таблицей Student: аккаунт, привязанный к
// активному студенту (users.univer_id = students.fizicheskoye_litso_uid), должен её
// иметь, а как только человек пропадает из Student (отчислен/выпустился) — роль
// снимается. Два места вызова (по прямой просьбе 2026-08-23): после полного синка
// студентов (sync.service.ts#runSync) — массово, и при каждом логине через rosnou-id
// (auth.controller.ts) — точечно, только для залогинившегося. Не трогает остальные
// роли (STAFF/ADMIN и кастомные) — только строку RESIDENT в users_roles.
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
  const students = await prisma.student.findMany({
    where: { fizicheskoyeLitsoUid: { in: uids } },
    select: { fizicheskoyeLitsoUid: true },
    distinct: ['fizicheskoyeLitsoUid'],
  });
  const studentUidSet = new Set(students.map((s) => s.fizicheskoyeLitsoUid));

  let granted = 0;
  let revoked = 0;
  for (const user of users) {
    const isStudent = user.univerId !== null && studentUidSet.has(user.univerId);
    const hasResident = user.roles.length > 0;
    if (isStudent && !hasResident) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: residentRole.id } });
      granted++;
    } else if (!isStudent && hasResident) {
      await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: residentRole.id } });
      revoked++;
    }
  }
  return { granted, revoked };
}
