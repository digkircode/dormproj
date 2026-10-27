export interface RosnouIdUser {
  id: number;
  surname: string;
  name: string;
  patronymic: string | null;
  email: string;
  full_name: string;
}

export type RoleName = 'ADMIN' | 'STAFF' | 'RESIDENT';

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
