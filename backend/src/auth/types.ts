// Форма ответа GET /api/user от rosnou-id (см. app/Models/User.php в их репозитории) —
// берём только то, что реально используем, остального в ответе больше.
export interface RosnouIdUser {
  id: number;
  surname: string;
  name: string;
  patronymic: string | null;
  email: string;
  full_name: string;
}

// Стабильные ключи ролей (roles.name в БД) — не для отображения, русские подписи
// см. ROLE_LABELS. Первый этап ролевой модели, см. schema.prisma/миграцию Role/UserRole.
export type RoleName = 'ADMIN' | 'STAFF' | 'RESIDENT';

// Полезная нагрузка нашей собственной сессионной JWT-куки. roles здесь — снимок на
// момент логина (auth.controller.ts#callback), в самой куке он и остаётся неизменным
// до следующего входа, НО для авторизации (RolesGuard) больше не используется напрямую —
// AuthGuard (2026-08-24) перечитывает актуальные роли из БД на каждый запрос и
// подменяет ими request.user.roles, само поле в JWT — просто исторический артефакт
// подписи, не источник истины. identity-поля (id/email/ФИО) по-прежнему берутся из
// токена без пересчёта.
export interface SessionUser {
  id: number;
  surname: string;
  name: string;
  patronymic: string | null;
  email: string;
  fullName: string;
  roles: RoleName[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}
