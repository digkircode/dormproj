<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

const columnLabels = computed<Record<string, string>>(() => ({
  fullName: t('users.staff.colFullName'),
  email: t('users.staff.colEmail'),
  roles: t('users.staff.colRoles'),
  // 'role' — фильтр, не колонка (сама колонка называется 'roles', см. выше) — та же
  // схема, что citizenshipGroup в ReportsContingent.vue.
  role: t('users.staff.colRole'),
}))
const filterableFields = ['role']
const cellRenderers = { roles: UserRolesCell }

const columnHelper = createAppColumnHelper<UserRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('fullName', { header: columnLabels.value.fullName, enableHiding: false, size: 260, minSize: 180 }),
    columnHelper.accessor('email', { header: columnLabels.value.email, size: 240, minSize: 160 }),
    columnHelper.accessor('roles', { header: columnLabels.value.roles, enableSorting: false, size: 240, minSize: 160 }),
  ]),
)

const dialogRef = ref<InstanceType<typeof ManageUserRolesDialog> | null>(null)
const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('users.staff.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('users.staff.title') }}</h1>
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
      :total-label="t('users.staff.totalLabel')"
      :cell-renderers="cellRenderers"
      storage-key="users-staff"
      accent-icons
      :row-action="{ icon: Shield, label: t('users.staff.manageRoles'), onClick: (u: UserRow) => dialogRef?.open(u) }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="dialogRef?.open()">
              <UserPlus />
              <span class="sr-only">{{ t('users.staff.grantRole') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('users.staff.grantRole') }}</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <ManageUserRolesDialog ref="dialogRef" @changed="tableRef?.refresh()" />
  </div>
</template>
