<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Shield, UserPlus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import UserRolesCell from '@/components/UserRolesCell.vue'
import ManageUserRolesDialog from '@/components/ManageUserRolesDialog.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchUsersPage, fetchUsersFacets, type UserRow } from '@/lib/users-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  email: 'Email',
  roles: 'Роли',
  // 'role' — фильтр, не колонка (сама колонка называется 'roles', см. выше) — та же
  // схема, что agingBucket в ReportsDebt.vue.
  role: 'Роль',
}
const filterableFields = ['role']
const cellRenderers = { roles: UserRolesCell }

const columnHelper = createAppColumnHelper<UserRow>()
const columns = columnHelper.columns([
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 260, minSize: 180 }),
  columnHelper.accessor('email', { header: columnLabels.email, size: 240, minSize: 160 }),
  columnHelper.accessor('roles', { header: columnLabels.roles, enableSorting: false, size: 240, minSize: 160 }),
])

const dialogRef = ref<InstanceType<typeof ManageUserRolesDialog> | null>(null)
const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Сотрудники</h1>
    </div>

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchUsersPage"
      :fetch-facet-values="fetchUsersFacets"
      :get-row-id="(u: UserRow) => String(u.id)"
      total-label="сотрудников"
      :cell-renderers="cellRenderers"
      storage-key="users-staff"
      accent-icons
      :row-action="{ icon: Shield, label: 'Управление ролями', onClick: (u: UserRow) => dialogRef?.open(u) }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="dialogRef?.open()">
              <UserPlus />
              <span class="sr-only">Выдать роль</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Выдать роль</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <ManageUserRolesDialog ref="dialogRef" @changed="tableRef?.refresh()" />
  </div>
</template>
