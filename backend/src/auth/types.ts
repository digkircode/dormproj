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

// Полезная нагрузка нашей собственной сессионной JWT-куки.
export interface SessionUser {
  id: number;
  surname: string;
  name: string;
  patronymic: string | null;
  email: string;
  fullName: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}
