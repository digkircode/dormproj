<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  fetchContracts,
  createContract,
  type ContractListItem,
  type DailyRateCategory,
} from '@/lib/contracts-api'
import { fetchIndividuals, type Individual } from '@/lib/individuals-api'
import { fetchRoomsTree, fetchRoomDetail, type RoomTreeItem } from '@/lib/rooms-api'
import { fetchDormitoryInfo } from '@/lib/dormitory-info-api'

const router = useRouter()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Действует', TERMINATED: 'Расторгнут', EXPIRED: 'Истёк' }
const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  TERMINATED: 'destructive',
  EXPIRED: 'secondary',
}

const contracts = ref<ContractListItem[]>([])
const isLoading = ref(true)
const loadError = ref('')
const search = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    const page = await fetchContracts({ page: 1, pageSize: 100, search: search.value })
    contracts.value = page.data
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(load, 300)
})

onMounted(load)

// --- Диалог создания договора ---
const isDialogOpen = ref(false)
const isSaving = ref(false)
const dialogError = ref('')

const number = ref('')
const contractDate = ref('')
const startDate = ref('')
const endDate = ref('')
const roomId = ref<number | null>(null)
const rentAmount = ref<number | undefined>(undefined)
const utilitiesAmount = ref<number | undefined>(undefined)
const dailyRateCategory = ref<DailyRateCategory>('OWN_UNIVERSITY')
const dailyRateAmount = ref<number | undefined>(undefined)
const paymentDueDay = ref(5)

const isMinor = ref(false)
const legalRepName = ref('')
const legalRepPhone = ref('')
const legalRepPassportSeries = ref('')
const legalRepPassportNumber = ref('')
const legalRepPassportIssuedBy = ref('')
const legalRepPassportIssuedAt = ref('')
const legalRepAddress = ref('')

const useMatCapital = ref(false)
const matCapitalCoveredFrom = ref('')
const matCapitalCoveredTo = ref('')
const matCapitalDeferredUntil = ref('')

const individualQuery = ref('')
const individualResults = ref<Individual[]>([])
const selectedIndividual = ref<Individual | null>(null)
let individualSearchTimeout: ReturnType<typeof setTimeout> | undefined

watch(individualQuery, (q) => {
  clearTimeout(individualSearchTimeout)
  if (!q.trim()) {
    individualResults.value = []
    return
  }
  individualSearchTimeout = setTimeout(async () => {
    const page = await fetchIndividuals({ page: 1, pageSize: 10, search: q, sortBy: 'fullName', sortDir: 'asc', filters: {} })
    individualResults.value = page.data
  }, 250)
})

function pickIndividual(ind: Individual) {
  selectedIndividual.value = ind
  individualQuery.value = ind.fullName
  individualResults.value = []
}

const rooms = ref<RoomTreeItem[]>([])
const dormInfo = ref<{ communalServicesCost: number | null; dailyPaymentInternal: number | null; dailyPaymentOther: number | null }>({
  communalServicesCost: null,
  dailyPaymentInternal: null,
  dailyPaymentOther: null,
})

async function openCreate() {
  dialogError.value = ''
  number.value = ''
  contractDate.value = new Date().toISOString().slice(0, 10)
  startDate.value = ''
  endDate.value = ''
  roomId.value = null
  rentAmount.value = undefined
  paymentDueDay.value = 5
  isMinor.value = false
  legalRepName.value = ''
  legalRepPhone.value = ''
  legalRepPassportSeries.value = ''
  legalRepPassportNumber.value = ''
  legalRepPassportIssuedBy.value = ''
  legalRepPassportIssuedAt.value = ''
  legalRepAddress.value = ''
  useMatCapital.value = false
  matCapitalCoveredFrom.value = ''
  matCapitalCoveredTo.value = ''
  matCapitalDeferredUntil.value = ''
  individualQuery.value = ''
  selectedIndividual.value = null
  individualResults.value = []

  if (rooms.value.length === 0) {
    rooms.value = await fetchRoomsTree()
  }
  const info = await fetchDormitoryInfo()
  dormInfo.value = info
  utilitiesAmount.value = info.communalServicesCost ?? undefined
  dailyRateAmount.value = info.dailyPaymentInternal ?? undefined

  isDialogOpen.value = true
}

// Категория определяет, какая суточная ставка по умолчанию (см. DormitoryInfo) — при
// смене категории обновляем подстановку, если сотрудник ещё не поправил значение вручную.
watch(dailyRateCategory, (category) => {
  dailyRateAmount.value = (category === 'OWN_UNIVERSITY' ? dormInfo.value.dailyPaymentInternal : dormInfo.value.dailyPaymentOther) ?? undefined
})

// Подстановка текущей "Стоимости" комнаты как найма по умолчанию — редактируемо сотрудником.
watch(roomId, async (id) => {
  if (id === null) return
  const detail = await fetchRoomDetail(id)
  const costCharacteristic = detail.characteristics.find((c) => c.name === 'Стоимость')
  if (costCharacteristic && typeof costCharacteristic.value === 'number') {
    rentAmount.value = costCharacteristic.value
  }
})

async function submitCreate() {
  dialogError.value = ''
  if (!selectedIndividual.value) {
    dialogError.value = 'Выберите проживающего'
    return
  }
  if (!roomId.value || !startDate.value || !endDate.value || !number.value.trim() || !contractDate.value) {
    dialogError.value = 'Заполните обязательные поля'
    return
  }
  if (rentAmount.value === undefined || utilitiesAmount.value === undefined || dailyRateAmount.value === undefined) {
    dialogError.value = 'Заполните финансовые условия'
    return
  }

  isSaving.value = true
  try {
    const created = await createContract({
      number: number.value.trim(),
      contractDate: contractDate.value,
      residentIndividualUid: selectedIndividual.value.fizicheskoyeLitsoUid,
      roomId: roomId.value,
      startDate: startDate.value,
      endDate: endDate.value,
      rentAmount: rentAmount.value,
      utilitiesAmount: utilitiesAmount.value,
      dailyRateCategory: dailyRateCategory.value,
      dailyRateAmount: dailyRateAmount.value,
      paymentDueDay: paymentDueDay.value,
      legalRepName: legalRepName.value.trim() || null,
      legalRepPhone: legalRepPhone.value.trim() || null,
      legalRepPassportSeries: isMinor.value ? legalRepPassportSeries.value.trim() || null : null,
      legalRepPassportNumber: isMinor.value ? legalRepPassportNumber.value.trim() || null : null,
      legalRepPassportIssuedBy: isMinor.value ? legalRepPassportIssuedBy.value.trim() || null : null,
      legalRepPassportIssuedAt: isMinor.value && legalRepPassportIssuedAt.value ? legalRepPassportIssuedAt.value : null,
      legalRepAddress: isMinor.value ? legalRepAddress.value.trim() || null : null,
      matCapitalCoveredFrom: useMatCapital.value && matCapitalCoveredFrom.value ? matCapitalCoveredFrom.value : null,
      matCapitalCoveredTo: useMatCapital.value && matCapitalCoveredTo.value ? matCapitalCoveredTo.value : null,
      matCapitalDeferredUntil: useMatCapital.value && matCapitalDeferredUntil.value ? matCapitalDeferredUntil.value : null,
    })
    isDialogOpen.value = false
    await router.push({ name: 'contract-detail', params: { id: created.id } })
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSaving.value = false
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-medium">Договоры найма</h1>
      <Button @click="openCreate">
        <Plus />
        Новый договор
      </Button>
    </div>

    <div class="relative max-w-sm">
      <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input v-model="search" placeholder="Поиск по номеру или ФИО" class="pl-8" />
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>

    <Card class="min-w-0 gap-0 py-0">
      <div class="overflow-hidden rounded-lg border">
        <p v-if="isLoading" class="p-6 text-sm text-muted-foreground">Загрузка…</p>
        <p v-else-if="!contracts.length" class="p-6 text-sm text-muted-foreground">Договоров пока нет</p>
        <Table v-else>
          <TableHeader class="bg-muted">
            <TableRow>
              <TableHead>№ договора</TableHead>
              <TableHead>Проживающий</TableHead>
              <TableHead>Комната</TableHead>
              <TableHead>Период</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="c in contracts"
              :key="c.id"
              class="cursor-pointer"
              @click="router.push({ name: 'contract-detail', params: { id: c.id } })"
            >
              <TableCell>{{ c.number }}</TableCell>
              <TableCell>{{ c.residentFullName }}</TableCell>
              <TableCell>{{ c.room ?? '—' }}</TableCell>
              <TableCell>{{ formatDate(c.startDate) }} — {{ formatDate(c.actualEndDate ?? c.endDate) }}</TableCell>
              <TableCell>
                <Badge :variant="STATUS_VARIANTS[c.status]">{{ STATUS_LABELS[c.status] }}</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>

    <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-2xl', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Новый договор найма</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Номер договора</Label>
              <Input v-model="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Дата договора</Label>
              <Input v-model="contractDate" type="date" />
            </div>
          </div>

          <div class="relative flex flex-col gap-2">
            <Label>Проживающий</Label>
            <Input v-model="individualQuery" placeholder="Начните вводить ФИО…" />
            <div
              v-if="individualResults.length"
              class="absolute top-full z-10 mt-1 w-full rounded-md border bg-popover shadow-md"
            >
              <button
                v-for="ind in individualResults"
                :key="ind.fizicheskoyeLitsoUid"
                type="button"
                class="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                @click="pickIndividual(ind)"
              >
                {{ ind.fullName }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Комната</Label>
              <Select :model-value="roomId ? String(roomId) : undefined" @update:model-value="(v) => (roomId = Number(v))">
                <SelectTrigger>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="r in rooms" :key="r.id" :value="String(r.id)">{{ r.room }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex flex-col gap-2">
              <Label>Дата начала</Label>
              <Input v-model="startDate" type="date" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Дата окончания</Label>
              <Input v-model="endDate" type="date" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Найм, ₽/мес</Label>
              <Input v-model.number="rentAmount" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Коммуналка, ₽/мес</Label>
              <Input v-model.number="utilitiesAmount" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Срок оплаты, число месяца</Label>
              <Input v-model.number="paymentDueDay" type="number" min="1" max="28" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Категория проживающего</Label>
              <Select :model-value="dailyRateCategory" @update:model-value="(v) => (dailyRateCategory = v as DailyRateCategory)">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWN_UNIVERSITY">Студент РосНОУ</SelectItem>
                  <SelectItem value="OTHER_UNIVERSITY">Студент другого вуза</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex flex-col gap-2">
              <Label>Суточная ставка, ₽</Label>
              <Input v-model.number="dailyRateAmount" type="number" />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Checkbox :model-value="isMinor" @update:model-value="(v) => (isMinor = !!v)" />
            <Label class="font-normal">Проживающий несовершеннолетний (родитель — сторона договора)</Label>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label>{{ isMinor ? 'ФИО родителя' : 'ФИО родителя (необязательно)' }}</Label>
              <Input v-model="legalRepName" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Телефон родителя</Label>
              <Input v-model="legalRepPhone" />
            </div>
          </div>
          <div v-if="isMinor" class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Паспорт родителя: серия</Label>
              <Input v-model="legalRepPassportSeries" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Паспорт родителя: номер</Label>
              <Input v-model="legalRepPassportNumber" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Кем и когда выдан</Label>
              <Input v-model="legalRepPassportIssuedBy" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Дата выдачи</Label>
              <Input v-model="legalRepPassportIssuedAt" type="date" />
            </div>
            <div class="col-span-2 flex flex-col gap-2">
              <Label>Адрес регистрации родителя</Label>
              <Input v-model="legalRepAddress" />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Checkbox :model-value="useMatCapital" @update:model-value="(v) => (useMatCapital = !!v)" />
            <Label class="font-normal">Оплата материнским капиталом</Label>
          </div>
          <div v-if="useMatCapital" class="grid grid-cols-3 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Период с</Label>
              <Input v-model="matCapitalCoveredFrom" type="date" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Период по</Label>
              <Input v-model="matCapitalCoveredTo" type="date" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Отсрочка оплаты до</Label>
              <Input v-model="matCapitalDeferredUntil" type="date" />
            </div>
          </div>

          <p v-if="dialogError" class="text-sm text-red-500">{{ dialogError }}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">Отмена</Button>
          <Button :disabled="isSaving" @click="submitCreate">Создать договор</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
