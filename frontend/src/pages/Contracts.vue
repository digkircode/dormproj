<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import EntityTable from '@/components/EntityTable.vue'
import ContractStatusCell from '@/components/ContractStatusCell.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import PhoneInput from '@/components/PhoneInput.vue'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchContractsPage,
  fetchContractFacets,
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
// Тот же fade, что и у переключения содержимого в RoomDetailPanel.vue — единообразная
// анимация появления полей по всему приложению.
const REVEAL_TRANSITION = {
  enterActiveClass: 'animate-in fade-in-0 duration-200',
  leaveActiveClass: 'animate-out fade-out-0 duration-150',
}

// --- Список договоров ---
const columnLabels: Record<string, string> = {
  number: '№ договора',
  residentFullName: 'Проживающий',
  room: 'Комната',
  startDate: 'Начало',
  endDate: 'Окончание',
  status: 'Статус',
}
const filterableFields = ['status']
const cellRenderers = { status: ContractStatusCell }

function cellText(columnId: string, value: unknown): string {
  if ((columnId === 'startDate' || columnId === 'endDate') && typeof value === 'string') {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContractListItem>()

const columns = columnHelper.columns([
  columnHelper.accessor('number', { header: columnLabels.number, enableHiding: false, size: 128, minSize: 100 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, size: 240, minSize: 160 }),
  columnHelper.accessor('room', { header: columnLabels.room, size: 112, minSize: 90 }),
  columnHelper.accessor('startDate', { header: columnLabels.startDate, size: 128, minSize: 100 }),
  columnHelper.accessor('endDate', { header: columnLabels.endDate, size: 128, minSize: 100 }),
  columnHelper.accessor('status', { header: columnLabels.status, size: 128, minSize: 100 }),
])

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
// Коммуналка и суточная ставка больше не показываются в форме (цена комнаты уже
// включает коммунальные услуги), но остаются во внутренней логике — бэкенд и расчёт
// начислений/пени по-прежнему хранят их отдельными полями (см. billing/accrual-generation.ts).
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

// --- Поиск проживающего (SearchSelect) ---
const individualQuery = ref('')
const individualResults = ref<Individual[]>([])
const selectedIndividual = ref<Individual | null>(null)
let individualSearchTimeout: ReturnType<typeof setTimeout> | undefined

function onIndividualSearch(q: string) {
  clearTimeout(individualSearchTimeout)
  selectedIndividual.value = null
  if (!q.trim()) {
    individualResults.value = []
    return
  }
  individualSearchTimeout = setTimeout(async () => {
    const page = await fetchIndividuals({ page: 1, pageSize: 10, search: q, sortBy: 'fullName', sortDir: 'asc', filters: {} })
    individualResults.value = page.data
  }, 250)
}

function pickIndividual(ind: Individual) {
  selectedIndividual.value = ind
  individualQuery.value = ind.fullName
  individualResults.value = []
}

// --- Поиск комнаты (SearchSelect, список уже загружен целиком — фильтр на клиенте) ---
const rooms = ref<RoomTreeItem[]>([])
const roomQuery = ref('')
const roomResults = ref<RoomTreeItem[]>([])

function onRoomSearch(q: string) {
  const query = q.trim().toLowerCase()
  roomResults.value = query ? rooms.value.filter((r) => r.room.toLowerCase().includes(query)) : rooms.value
}

function pickRoom(r: RoomTreeItem) {
  roomId.value = r.id
  roomQuery.value = r.room
  roomResults.value = []
}

const dormInfo = ref<{ communalServicesCost: number | null; dailyPaymentInternal: number | null; dailyPaymentOther: number | null }>({
  communalServicesCost: null,
  dailyPaymentInternal: null,
  dailyPaymentOther: null,
})

function defaultEndDate(from: string): string {
  const year = new Date(from).getFullYear()
  return `${year + 1}-08-31`
}

// Дата окончания подставляется автоматически при каждом выборе даты начала —
// по прямой просьбе, сотрудник может поправить её вручную после подстановки.
watch(startDate, (value) => {
  if (value) endDate.value = defaultEndDate(value)
})

async function openCreate() {
  dialogError.value = ''
  number.value = ''
  contractDate.value = new Date().toISOString().slice(0, 10)
  startDate.value = ''
  endDate.value = ''
  roomId.value = null
  roomQuery.value = ''
  roomResults.value = []
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
  // Список комнат уже загружен целиком — сразу показываем его в дропдауне по фокусу,
  // не дожидаясь первого ввода (см. SearchSelect: без начального items дропдаун
  // по фокусу открывать нечего).
  roomResults.value = rooms.value
  const info = await fetchDormitoryInfo()
  dormInfo.value = info
  utilitiesAmount.value = info.communalServicesCost ?? undefined
  dailyRateAmount.value = info.dailyPaymentInternal ?? undefined

  isDialogOpen.value = true
}

// Категория определяет, какая суточная ставка по умолчанию (см. DormitoryInfo) — при
// смене категории обновляем подстановку (поле не показывается, но участвует в расчёте пени).
watch(dailyRateCategory, (category) => {
  dailyRateAmount.value = (category === 'OWN_UNIVERSITY' ? dormInfo.value.dailyPaymentInternal : dormInfo.value.dailyPaymentOther) ?? undefined
})

// Подстановка текущей "Стоимости" комнаты как найма по умолчанию (уже с учётом
// коммунальных услуг) — редактируемо сотрудником.
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

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'startDate', desc: true }"
      :fetch-page="fetchContractsPage"
      :fetch-facet-values="fetchContractFacets"
      :get-row-id="(c: ContractListItem) => String(c.id)"
      total-label="договоров"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="contracts"
      accent-icons
      :row-action="{ icon: ExternalLink, label: 'Открыть договор', getHref: (c: ContractListItem) => `/contracts/${c.id}` }"
    />

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
              <DatePickerField v-model="contractDate" />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <Label>Проживающий</Label>
            <SearchSelect
              v-model="individualQuery"
              :items="individualResults"
              :item-key="(i: Individual) => i.fizicheskoyeLitsoUid"
              :item-label="(i: Individual) => i.fullName"
              placeholder="Начните вводить ФИО…"
              @search="onIndividualSearch"
              @select="pickIndividual"
            />
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Комната</Label>
              <SearchSelect
                v-model="roomQuery"
                :items="roomResults"
                :item-key="(r: RoomTreeItem) => r.id"
                :item-label="(r: RoomTreeItem) => r.room"
                placeholder="Начните вводить номер…"
                @search="onRoomSearch"
                @select="pickRoom"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Дата начала</Label>
              <DatePickerField v-model="startDate" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Дата окончания</Label>
              <DatePickerField v-model="endDate" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label>Найм, ₽/мес <span class="font-normal text-muted-foreground">(с учётом коммунальных услуг)</span></Label>
              <Input v-model.number="rentAmount" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Срок оплаты, число месяца</Label>
              <Input v-model.number="paymentDueDay" type="number" min="1" max="28" />
            </div>
          </div>

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

          <div
            class="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-accent"
            @click="isMinor = !isMinor"
          >
            <Checkbox :model-value="isMinor" />
            <Label class="cursor-pointer font-normal">Проживающий несовершеннолетний (родитель — сторона договора)</Label>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <Label>{{ isMinor ? 'ФИО родителя' : 'ФИО родителя (необязательно)' }}</Label>
              <Input v-model="legalRepName" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Телефон родителя</Label>
              <PhoneInput v-model="legalRepPhone" />
            </div>
          </div>
          <Transition v-bind="REVEAL_TRANSITION">
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
                <DatePickerField v-model="legalRepPassportIssuedAt" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>Адрес регистрации родителя</Label>
                <Input v-model="legalRepAddress" />
              </div>
            </div>
          </Transition>

          <div
            class="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-accent"
            @click="useMatCapital = !useMatCapital"
          >
            <Checkbox :model-value="useMatCapital" />
            <Label class="cursor-pointer font-normal">Оплата материнским капиталом</Label>
          </div>
          <Transition v-bind="REVEAL_TRANSITION">
            <div v-if="useMatCapital" class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-2">
                <Label>Период с</Label>
                <DatePickerField v-model="matCapitalCoveredFrom" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Период по</Label>
                <DatePickerField v-model="matCapitalCoveredTo" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Отсрочка оплаты до</Label>
                <DatePickerField v-model="matCapitalDeferredUntil" />
              </div>
            </div>
          </Transition>

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
