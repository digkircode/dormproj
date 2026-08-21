import { SetMetadata } from '@nestjs/common';
import type { RoleName } from './types';

export const ROLES_KEY = 'roles';

// Список — "хотя бы одна из перечисленных" (не все сразу). ADMIN обходит любую
// проверку без явного перечисления — см. RolesGuard.
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
