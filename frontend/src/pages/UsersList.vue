<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Pencil, UserPlus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import UserRolesCell from '@/components/UserRolesCell.vue'
import ManageUserRolesDialog from '@/components/ManageUserRolesDialog.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchAllUsersPage, fetchUsersFacets, updateUserLinks, type AllUsersRow } from '@/lib/users-api'
import { USER_ROLES_CLICK_KEY } from '@/lib/user-roles-click'
import { goBack, parseApiError } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

// Клик по ячейке "Роли" открывает выдачу/отзыв — единственный rowAction EntityTable уже
// занят правкой bind/azure/univer id (см. openEdit ниже), см. комментарий в UserRolesCell.vue.
const rolesDialogRef = ref<InstanceType<typeof ManageUserRolesDialog> | null>(null)
provide(USER_ROLES_CLICK_KEY, (row) => rolesDialogRef.value?.open(row as AllUsersRow))

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

const columnLabels = computed<Record<string, string>>(() => ({
  fullName: t('users.list.colFullName'),
  email: t('users.list.colEmail'),
  bindId: t('users.list.colBindId'),
  azureId: t('users.list.colAzureId'),
  univerId: t('users.list.colUniverId'),
  roles: t('users.list.colRoles'),
  createdAt: t('users.list.colCreatedAt'),
  // 'role' — фильтр, не колонка (сама колонка называется 'roles', см. ниже) — та же
  // схема, что в UsersStaff.vue.
  role: t('users.list.colRole'),
}))
const filterableFields = ['role']
const cellRenderers = { roles: UserRolesCell }
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'createdAt' && typeof value === 'string') return formatDateIso(value)
  return String(value ?? '—')
}

const columnHelper = createAppColumnHelper<AllUsersRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('fullName', { header: columnLabels.value.fullName, enableHiding: false, size: 220, minSize: 160 }),
    columnHelper.accessor('email', { header: columnLabels.value.email, size: 200, minSize: 140 }),
    columnHelper.accessor('bindId', { header: columnLabels.value.bindId, size: 140, minSize: 110 }),
    columnHelper.accessor('azureId', { header: columnLabels.value.azureId, size: 160, minSize: 120 }),
    columnHelper.accessor('univerId', { header: columnLabels.value.univerId, size: 140, minSize: 110 }),
    columnHelper.accessor('roles', { header: columnLabels.value.roles, enableSorting: false, size: 200, minSize: 140 }),
    columnHelper.accessor('createdAt', { header: columnLabels.value.createdAt, size: 120, minSize: 100 }),
  ]),
)

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)

// Правка bind_id/azure_id/univer_id вручную — по прямой просьбе 2026-08-23, больше
// нигде в проекте это не редактируется (только разовый импорт, см. промпт проекта).
// univerId — настоящий FK на Individual, несуществующий uid бэкенд отклонит понятной
// ошибкой (см. users.controller.ts#updateLinks).
const isEditOpen = ref(false)
const isSaving = ref(false)
const editError = ref('')
const editUserId = ref<number | null>(null)
const editAzureId = ref('')
const editUniverId = ref('')

function openEdit(user: AllUsersRow) {
  editError.value = ''
  editUserId.value = user.id
  editAzureId.value = user.azureId ?? ''
  editUniverId.value = user.univerId ?? ''
  isEditOpen.value = true
}

async function submitEdit() {
  if (editUserId.value === null) return
  editError.value = ''
  isSaving.value = true
  try {
    await updateUserLinks(editUserId.value, {
      azureId: editAzureId.value.trim() || null,
      univerId: editUniverId.value.trim() || null,
    })
    isEditOpen.value = false
    await tableRef.value?.refresh()
  } catch (error) {
    editError.value = parseApiError(error).message
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('users.list.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('users.list.title') }}</h1>
    </div>

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :fetch-facet-values="fetchUsersFacets"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchAllUsersPage"
      :get-row-id="(u: AllUsersRow) => String(u.id)"
      :total-label="t('users.list.totalLabel')"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="users-all"
      accent-icons
      :row-action="{ icon: Pencil, label: t('users.list.editAction'), onClick: (u: AllUsersRow) => openEdit(u) }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="rolesDialogRef?.open()">
              <UserPlus />
              <span class="sr-only">{{ t('users.list.grantRole') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('users.list.grantRole') }}</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <Dialog :open="isEditOpen" @update:open="(v) => (isEditOpen = v)">
      <DialogScrollContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('users.list.editDialogTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label>{{ t('users.list.azureId') }}</Label>
            <Input v-model="editAzureId" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ t('users.list.univerId') }}</Label>
            <Input v-model="editUniverId" :placeholder="t('users.list.univerIdPlaceholder')" />
          </div>
        </div>
        <DialogFooter>
          <p v-if="editError" class="mr-auto self-center text-sm text-red-500">{{ editError }}</p>
          <Button variant="outline" @click="isEditOpen = false">{{ t('users.list.cancel') }}</Button>
          <Button :loading="isSaving" @click="submitEdit">{{ t('users.list.save') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <ManageUserRolesDialog ref="rolesDialogRef" @changed="tableRef?.refresh()" />
  </div>
</template>
