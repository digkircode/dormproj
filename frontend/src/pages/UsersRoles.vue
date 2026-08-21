<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Plus, Shield } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { fetchRoles, createRole, roleLabel, type Role } from '@/lib/roles-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const roles = ref<Role[]>([])
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    roles.value = await fetchRoles()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}
onMounted(load)

const isCreateOpen = ref(false)
const newRoleName = ref('')
const createError = ref('')
const isCreating = ref(false)

function openCreate() {
  newRoleName.value = ''
  createError.value = ''
  isCreateOpen.value = true
}
async function submitCreate() {
  if (!newRoleName.value.trim()) return
  isCreating.value = true
  createError.value = ''
  try {
    await createRole(newRoleName.value.trim())
    isCreateOpen.value = false
    await load()
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
          <ArrowLeft class="text-primary" />
          <span class="sr-only">Назад</span>
        </Button>
        <h1 class="text-lg font-medium">Роли</h1>
      </div>
      <Button size="icon" @click="openCreate">
        <Plus />
        <span class="sr-only">Добавить роль</span>
      </Button>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <Card v-else class="gap-0 py-0">
      <Table>
        <TableHeader class="bg-muted sticky top-0 z-10">
          <TableRow>
            <TableHead>Роль</TableHead>
            <TableHead>Пользователей</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="r in roles" :key="r.id">
            <TableCell class="flex items-center gap-1.5 font-medium">
              <Shield class="size-4 shrink-0 text-primary" />
              {{ roleLabel(r.name) }}
            </TableCell>
            <TableCell class="text-muted-foreground">{{ r._count.users }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>

    <Dialog :open="isCreateOpen" @update:open="(open) => (isCreateOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Новая роль</DialogTitle>
        </DialogHeader>
        <!-- Новая роль сама по себе ничего не разрешает — RolesGuard на бэкенде
             проверяет конкретные строковые ключи (ADMIN/STAFF/RESIDENT), незнакомое
             имя просто ляжет в справочник без единой проверки на него в коде. -->
        <div class="flex flex-col gap-2">
          <Label>Название</Label>
          <Input v-model="newRoleName" @keyup.enter="submitCreate" />
        </div>
        <p v-if="createError" class="text-sm text-red-500">{{ createError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isCreateOpen = false">Отмена</Button>
          <Button :disabled="!newRoleName.trim()" :loading="isCreating" @click="submitCreate">Создать</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
