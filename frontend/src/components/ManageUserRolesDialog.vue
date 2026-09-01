<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, UserRound, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import SearchSelect from '@/components/SearchSelect.vue'
import { fetchRoles, roleLabel, roleIcon, type Role } from '@/lib/roles-api'
import { searchUsers, grantRole, revokeRole, type UserRow } from '@/lib/users-api'

const { t } = useI18n()

const emit = defineEmits<{ changed: [] }>()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const isOpen = ref(false)
// Пришли с готовым пользователем (клик по строке в таблице) — шаг поиска пропускаем,
// как prefillIndividual в CreateContractDialog.vue.
const isLocked = ref(false)

const selectedUser = ref<UserRow | null>(null)
const userQuery = ref('')
const userResults = ref<UserRow[]>([])
const userSearching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | undefined

function onUserSearch(q: string) {
  clearTimeout(searchTimeout)
  selectedUser.value = null
  if (!q.trim()) {
    userResults.value = []
    userSearching.value = false
    return
  }
  userSearching.value = true
  searchTimeout = setTimeout(async () => {
    userResults.value = await searchUsers(q)
    userSearching.value = false
  }, 250)
}

function pickUser(user: UserRow) {
  selectedUser.value = user
  userQuery.value = user.fullName
  userResults.value = []
}

const allRoles = ref<Role[]>([])
const roleToGrant = ref<number | undefined>(undefined)
const availableRoles = computed(() => allRoles.value.filter((r) => !selectedUser.value?.roles.some((ur) => ur.id === r.id)))

const isGranting = ref(false)
const isRevokingId = ref<number | null>(null)
const error = ref('')

async function open(prefillUser?: UserRow) {
  error.value = ''
  isLocked.value = !!prefillUser
  selectedUser.value = prefillUser ?? null
  userQuery.value = prefillUser?.fullName ?? ''
  userResults.value = []
  roleToGrant.value = undefined
  if (allRoles.value.length === 0) {
    allRoles.value = await fetchRoles()
  }
  isOpen.value = true
}
defineExpose({ open })

async function submitGrant() {
  if (!selectedUser.value || roleToGrant.value === undefined) return
  isGranting.value = true
  error.value = ''
  try {
    selectedUser.value = await grantRole(selectedUser.value.id, roleToGrant.value)
    roleToGrant.value = undefined
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isGranting.value = false
  }
}

async function onRevoke(roleId: number) {
  if (!selectedUser.value) return
  isRevokingId.value = roleId
  error.value = ''
  try {
    selectedUser.value = await revokeRole(selectedUser.value.id, roleId)
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isRevokingId.value = null
  }
}
</script>

<template>
  <Dialog :open="isOpen" @update:open="(open) => (isOpen = open)">
    <DialogScrollContent :class="['flex min-h-[26rem] flex-col gap-4 sm:max-w-xl', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ t('users.manageDialog.title') }}</DialogTitle>
      </DialogHeader>

      <div v-if="!isLocked" class="flex flex-col gap-2">
        <Label>{{ t('users.manageDialog.user') }}</Label>
        <SearchSelect
          v-model="userQuery"
          :items="userResults"
          :item-key="(u: UserRow) => u.id"
          :item-label="(u: UserRow) => u.fullName"
          :item-sub-label="(u: UserRow) => u.email ?? ''"
          :placeholder="t('users.manageDialog.userPlaceholder')"
          :loading="userSearching"
          @search="onUserSearch"
          @select="pickUser"
        />
      </div>
      <div v-else class="flex items-center gap-1.5 text-sm font-medium">
        <UserRound class="size-4 shrink-0 text-primary" />
        {{ selectedUser?.fullName }}
      </div>

      <!-- Секции ниже отрисовываются сразу, даже пока пользователь не выбран (по прямой
           просьбе 2026-09-01) — не только когда пришли с готовым (isLocked), но и в самом
           обычном сценарии поиска: без этого высота диалога скакала между "только поиск" и
           "поиск + роли", теперь она стабильна с самого открытия. Пока пользователь не
           выбран — вместо пилюль ролей предупреждение, а сам селект недоступен. -->
      <div class="flex flex-col gap-2">
        <Label>{{ t('users.manageDialog.currentRoles') }}</Label>
        <p v-if="!selectedUser" class="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle class="size-3.5 shrink-0" />
          {{ t('users.manageDialog.selectUserFirst') }}
        </p>
        <p v-else-if="!selectedUser.roles.length" class="text-sm text-muted-foreground">{{ t('users.manageDialog.noRoles') }}</p>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="r in selectedUser.roles"
            :key="r.id"
            class="flex items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-sm"
          >
            <component :is="roleIcon(r.name)" class="size-3.5 shrink-0 text-primary" />
            {{ roleLabel(r.name) }}
            <button
              type="button"
              class="shrink-0 rounded-sm p-0.5 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              :disabled="isRevokingId === r.id"
              @click="onRevoke(r.id)"
            >
              <X class="size-3.5" />
              <span class="sr-only">{{ t('users.manageDialog.revokeRole', { role: roleLabel(r.name) }) }}</span>
            </button>
          </span>
        </div>
      </div>

      <div class="flex items-end gap-2">
        <div class="flex flex-1 flex-col gap-2">
          <Label>{{ t('users.manageDialog.grantRoleLabel') }}</Label>
          <Select
            :disabled="!selectedUser"
            :model-value="roleToGrant ? String(roleToGrant) : undefined"
            @update:model-value="(v) => (roleToGrant = Number(v))"
          >
            <SelectTrigger>
              <SelectValue :placeholder="t('users.manageDialog.selectRolePlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in availableRoles" :key="r.id" :value="String(r.id)">
                <span class="flex items-center gap-1.5">
                  <component :is="roleIcon(r.name)" class="size-3.5 shrink-0 text-primary" />
                  {{ roleLabel(r.name) }}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button :disabled="!selectedUser || roleToGrant === undefined" :loading="isGranting" @click="submitGrant">
          {{ t('users.manageDialog.grant') }}
        </Button>
      </div>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    </DialogScrollContent>
  </Dialog>
</template>
