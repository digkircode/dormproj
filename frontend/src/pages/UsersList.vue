<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Pencil } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import EntityTable from '@/components/EntityTable.vue'
import UserRolesCell from '@/components/UserRolesCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchAllUsersPage, updateUserLinks, type AllUsersRow } from '@/lib/users-api'
import { goBack, parseApiError } from '@/lib/utils'

const router = useRouter()

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  email: 'Email',
  bindId: 'bind_id',
  azureId: 'azure_id',
  univerId: 'univer_id',
  roles: 'Роли',
  createdAt: 'Добавлен',
}
const cellRenderers = { roles: UserRolesCell }
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'createdAt' && typeof value === 'string') return formatDateIso(value)
  return String(value ?? '—')
}

const columnHelper = createAppColumnHelper<AllUsersRow>()
const columns = columnHelper.columns([
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 220, minSize: 160 }),
  columnHelper.accessor('email', { header: columnLabels.email, size: 200, minSize: 140 }),
  columnHelper.accessor('bindId', { header: columnLabels.bindId, size: 140, minSize: 110 }),
  columnHelper.accessor('azureId', { header: columnLabels.azureId, size: 160, minSize: 120 }),
  columnHelper.accessor('univerId', { header: columnLabels.univerId, size: 140, minSize: 110 }),
  columnHelper.accessor('roles', { header: columnLabels.roles, enableSorting: false, size: 200, minSize: 140 }),
  columnHelper.accessor('createdAt', { header: columnLabels.createdAt, size: 120, minSize: 100 }),
])

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
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Список пользователей</h1>
    </div>

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="[]"
      :fetch-facet-values="async () => []"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchAllUsersPage"
      :get-row-id="(u: AllUsersRow) => String(u.id)"
      total-label="пользователей"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="users-all"
      accent-icons
      :row-action="{ icon: Pencil, label: 'Изменить azure_id/univer_id', onClick: (u: AllUsersRow) => openEdit(u) }"
    />

    <Dialog :open="isEditOpen" @update:open="(v) => (isEditOpen = v)">
      <DialogScrollContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>azure_id / univer_id</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label>azure_id</Label>
            <Input v-model="editAzureId" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>univer_id</Label>
            <Input v-model="editUniverId" placeholder="UID физлица (fizicheskoye_litso_uid)" />
          </div>
        </div>
        <DialogFooter>
          <p v-if="editError" class="mr-auto self-center text-sm text-red-500">{{ editError }}</p>
          <Button variant="outline" @click="isEditOpen = false">Отмена</Button>
          <Button :loading="isSaving" @click="submitEdit">Сохранить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
