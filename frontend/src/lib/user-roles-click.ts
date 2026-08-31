import type { InjectionKey } from 'vue'
import type { Role } from './roles-api'

// Опциональный обработчик клика по ячейке "Роли" (UserRolesCell.vue) — inject, не проп,
// т.к. ячейка рендерится генерически через cellRenderers в EntityTable.vue (:value/:row,
// без произвольных доп. пропов/обработчиков на конкретную колонку). Родитель, которому
// нужен клик по этой ячейке (см. UsersList.vue — там rowAction EntityTable уже занят
// правкой bind/azure/univer id), предоставляет обработчик через provide(); если не
// предоставлен — ячейка остаётся некликабельной (см. UsersStaff.vue — там своя кнопка-
// действие на строку).
export type RolesRow = { roles: Role[] }
export const USER_ROLES_CLICK_KEY: InjectionKey<(row: RolesRow) => void> = Symbol('userRolesClick')
