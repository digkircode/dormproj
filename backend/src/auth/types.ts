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

// Полезная нагрузка нашей собственной сессионной JWT-куки. roles — снимок на момент
// логина (см. auth.controller.ts callback), не обновляется до следующего входа —
// смена роли пользователю подхватится максимум через SESSION_TTL (24ч).
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
