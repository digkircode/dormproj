import type { InjectionKey } from 'vue'
import type { RoomCharacteristicDefinition } from './room-characteristic-definitions-api'

export interface DefinitionActions {
  edit: (definition: RoomCharacteristicDefinition) => void
  remove: (definition: RoomCharacteristicDefinition) => void
}

export const DEFINITION_ACTIONS_KEY: InjectionKey<DefinitionActions> = Symbol('definition-actions')
