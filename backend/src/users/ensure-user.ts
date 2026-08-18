import { Prisma } from '../../generated/prisma/client.js';
import type { SessionUser } from '../auth/types';

// users сейчас заполнена только импортом привязок SSO-аккаунтов к физлицам (см. миграцию
// add_users_table) — не все реальные сотрудники обязательно попали в этот импорт (импорт
// брал только тех, у кого univer_id совпал с физлицом, а не все аккаунты вообще). Чтобы
// createdByUserId на договорах/платежах не падал по FK на "своего" же залогиненного
// сотрудника, которого могло не быть в разовом импорте — подтверждаем/заводим его запись
// по данным сессии перед тем, как на неё ссылаться.
export async function ensureUserRecord(prisma: Prisma.TransactionClient, sessionUser: SessionUser): Promise<number> {
  await prisma.user.upsert({
    where: { id: sessionUser.id },
    create: { id: sessionUser.id, fullName: sessionUser.fullName },
    update: {},
  });
  return sessionUser.id;
}
