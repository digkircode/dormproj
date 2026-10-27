import type { InjectionKey } from 'vue'
import type { Role } from './roles-api'

export type RolesRow = { roles: Role[] }
export const USER_ROLES_CLICK_KEY: InjectionKey<(row: RolesRow) => void> = Symbol('userRolesClick')
