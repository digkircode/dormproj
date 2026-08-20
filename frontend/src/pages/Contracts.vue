<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, FileSignature, Plus, UserRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import ContractStatusCell from '@/components/ContractStatusCell.vue'
import RoomCell from '@/components/RoomCell.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import DateRangePickerField from '@/components/DateRangePickerField.vue'
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
import { fetchIndividuals, fetchIndividualDetail, type Individual } from '@/lib/individuals-api'
import { fetchRoomsTree, fetchRoomDetail, type RoomTreeItem } from '@/lib/rooms-api'
import { fetchDormitoryInfo } from '@/lib/dormitory-info-api'
import { blockNonNumericKeys } from '@/lib/utils'

const router = useRouter()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Скрывает нативные стрелочки +/- у <input type="number"> (Chrome/Safari + Firefox) —
// та же константа, что в Rooms.vue/RoomDetailPanel.vue.
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
// Тот же fade, что и у переключения содержимого в RoomDetailPanel.vue — единообразная
// анимация появления полей по всему приложению.
const REVEAL_TRANSITION = {
  enterActiveClass: 'animate-in fade-in-0 duration-200',
  leaveActiveClass: 'animate-out fade-out-0 duration-150',
}

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

// --- Список договоров ---
const columnLabels: Record<string, string> = {
  contractDate: 'Дата договора',
  number: '№ договора',
  residentFullName: 'Проживающий',
  room: 'Комната',
  startDate: 'Начало',
  endDate: 'Окончание',
  status: 'Статус',
}
const filterableFields = ['status']
const cellRenderers = { status: ContractStatusCell, room: RoomCell }

function cellText(columnId: string, value: unknown): string {
  if ((columnId === 'contractDate' || columnId === 'startDate' || columnId === 'endDate') && typeof value === 'string') {
    return formatDateIso(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContractListItem>()

const columns = columnHelper.columns([
  columnHelper.accessor('contractDate', { header: columnLabels.contractDate, size: 140, minSize: 110 }),
  columnHelper.accessor('number', { header: columnLabels.number, enableHiding: false, size: 128, minSize: 100 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, size: 240, minSize: 160 }),
  columnHelper.accessor('room', { header: columnLabels.room, size: 128, minSize: 100 }),
  columnHelper.accessor('startDate', { header: columnLabels.startDate, size: 128, minSize: 100 }),
  columnHelper.accessor('endDate', { header: columnLabels.endDate, size: 128, minSize: 100 }),
  columnHelper.accessor('status', { header: columnLabels.status, size: 128, minSize: 100 }),
])

// --- Диалог создания договора ---
const isDialogOpen = ref(false)
const isSaving = ref(false)
const dialogError = ref('')
// Ставится в true при первой неудачной попытке сохранить — до этого поля не подсвечиваем
// красным, чтобы не встречать пользователя ошибками на ещё не тронутой форме.
const submitAttempted = ref(false)

const number = ref('')
const contractDate = ref('')
const startDate = ref('')
const endDate = ref('')
const roomId = ref<number | null>(null)
const rentAmount = ref<number | undefined>(undefined)
// Коммуналка больше не показывается в форме — коммунальные услуги в БД уже включены в
// "Стоимость" комнаты (см. rentAmount ниже), отдельно их не начисляем, поэтому
// utilitiesAmount всегда 0 (поле в леджере остаётся под будущий раздельный учёт,
// см. billing/accrual-generation.ts, но сейчас не используется).
const utilitiesAmount = ref<number | undefined>(0)
// Категория определяет суточную ставку (см. watch ниже) — теперь не выбирается вручную,
// а определяется автоматически по тому, есть ли физлицо в Контингенте (см. pickIndividual).
const dailyRateCategory = ref<DailyRateCategory>('OTHER_UNIVERSITY')
const dailyRateAmount = ref<number | undefined>(undefined)
// Срок оплаты в форме не показываем и не даём менять — всегда 5 число месяца.
const paymentDueDay = ref(5)

const legalRepName = ref('')
const legalRepPhone = ref('')
const legalRepBirthDate = ref('')
const legalRepPassportSeries = ref('')
const legalRepPassportNumber = ref('')
const legalRepPassportIssuedBy = ref('')
const legalRepPassportIssuedCode = ref('')
const legalRepPassportIssuedAt = ref('')
const legalRepSnils = ref('')
const legalRepInn = ref('')

const useMatCapital = ref(false)
const matCapitalCoveredFrom = ref('')
const matCapitalCoveredTo = ref('')
const matCapitalAmount = ref<number | undefined>(undefined)
const matCapitalDeferredUntil = ref('')

const phoneInputRef = ref<InstanceType<typeof PhoneInput> | null>(null)

function calculateAge(birthDateIso: string, referenceIso: string): number {
  const birth = new Date(birthDateIso)
  const reference = new Date(referenceIso)
  let age = reference.getFullYear() - birth.getFullYear()
  const hadBirthdayThisYear =
    reference.getMonth() > birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() >= birth.getDate())
  if (!hadBirthdayThisYear) age--
  return age
}

// Несовершеннолетие — не чекбокс, а автоматический расчёт по дате рождения выбранного
// проживающего на дату договора (а не "сегодня" — юридически значим момент подписания).
// От него зависит, какая часть блока "Информация о родителе" показывается и обязательна —
// ФИО/телефон нужны всегда, остальное (паспорт, мат.капитал) только для несовершеннолетних.
const isMinor = computed(() => {
  const birthDate = selectedIndividual.value?.birthDate
  if (!birthDate) return false
  return calculateAge(birthDate, contractDate.value || new Date().toISOString().slice(0, 10)) < 18
})

// Backend отдаёт ошибку невалидного тела как JSON-строку массива zod-issues (ZodError.message) —
// например при рассинхроне типа (см. serverFieldErrors ниже). Сырой JSON пользователю показывать
// незачем: если формат распознан, даём понятный текст и подсвечиваем конкретные поля;
// если нет (обычная текстовая ошибка вроде "Комната уже занята") — показываем её как есть.
function parseApiError(error: unknown): { message: string; fields: Set<string> } {
  const raw = error instanceof Error ? error.message : String(error)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((i) => i && typeof i === 'object' && 'path' in i)) {
      const fields = new Set<string>()
      for (const issue of parsed as { path: unknown[] }[]) {
        const first = issue.path[0]
        if (typeof first === 'string') fields.add(first)
      }
      return { message: 'Проверьте правильность данных', fields }
    }
  } catch {
    // не JSON — обычное текстовое сообщение об ошибке, оставляем как есть
  }
  return { message: raw, fields: new Set() }
}
// Поля, на которые сервер пожаловался типом/форматом в последней попытке сохранить —
// например пустая "Стоимость" уходит как "" (см. известный баг v-model.number на
// очищенном поле), а не undefined, и клиентская проверка это не ловит.
const serverFieldErrors = ref<Set<string>>(new Set())

const numberInvalid = computed(() => submitAttempted.value && !number.value.trim())
const contractDateInvalid = computed(() => submitAttempted.value && !contractDate.value)
const roomInvalid = computed(() => submitAttempted.value && !roomId.value)
const startDateInvalid = computed(() => submitAttempted.value && !startDate.value)
const endDateInvalid = computed(() => submitAttempted.value && !endDate.value)
const individualInvalid = computed(() => submitAttempted.value && !selectedIndividual.value)
const rentAmountInvalid = computed(
  () => submitAttempted.value && (rentAmount.value === undefined || serverFieldErrors.value.has('rentAmount')),
)
// ФИО и телефон родителя — обязательны всегда, остальное только для несовершеннолетних.
const legalRepNameInvalid = computed(() => submitAttempted.value && !legalRepName.value.trim())
const legalRepBirthDateInvalid = computed(() => submitAttempted.value && isMinor.value && !legalRepBirthDate.value)
// Мат.капитал — поля обязательны, только если галочка "Оплата материнским капиталом" поставлена.
const matCapitalCoveredFromInvalid = computed(() => submitAttempted.value && useMatCapital.value && !matCapitalCoveredFrom.value)
const matCapitalCoveredToInvalid = computed(() => submitAttempted.value && useMatCapital.value && !matCapitalCoveredTo.value)
const matCapitalAmountInvalid = computed(
  () =>
    submitAttempted.value &&
    useMatCapital.value &&
    (matCapitalAmount.value === undefined || serverFieldErrors.value.has('matCapitalAmount')),
)
const matCapitalDeferredUntilInvalid = computed(() => submitAttempted.value && useMatCapital.value && !matCapitalDeferredUntil.value)

// --- Поиск проживающего (SearchSelect) ---
const individualQuery = ref('')
const individualResults = ref<Individual[]>([])
const selectedIndividual = ref<Individual | null>(null)
// Пока запрос не отработал (в т.ч. во время debounce) — "Ничего не найдено" не
// показываем, иначе оно мелькает при каждом нажатии клавиши ещё до самого поиска.
const individualSearching = ref(false)
let individualSearchTimeout: ReturnType<typeof setTimeout> | undefined

function onIndividualSearch(q: string) {
  clearTimeout(individualSearchTimeout)
  selectedIndividual.value = null
  if (!q.trim()) {
    individualResults.value = []
    individualSearching.value = false
    return
  }
  individualSearching.value = true
  individualSearchTimeout = setTimeout(async () => {
    const page = await fetchIndividuals({ page: 1, pageSize: 10, search: q, sortBy: 'fullName', sortDir: 'asc', filters: {} })
    individualResults.value = page.data
    individualSearching.value = false
  }, 250)
}

async function pickIndividual(ind: Individual) {
  selectedIndividual.value = ind
  individualQuery.value = ind.fullName
  individualResults.value = []
  // Категория проживающего — автоматически по наличию в Контингенте (таблица Student,
  // синхронизируется из 1С только для студентов РосНОУ), а не ручным выбором.
  try {
    const detail = await fetchIndividualDetail(ind.fizicheskoyeLitsoUid)
    dailyRateCategory.value = detail.students.length > 0 ? 'OWN_UNIVERSITY' : 'OTHER_UNIVERSITY'
  } catch {
    dailyRateCategory.value = 'OTHER_UNIVERSITY'
  }
}

// --- Поиск комнаты (SearchSelect, список уже загружен целиком — фильтр на клиенте) ---
const rooms = ref<RoomTreeItem[]>([])
const roomQuery = ref('')
const roomResults = ref<RoomTreeItem[]>([])

function onRoomSearch(q: string) {
  // Как и у ФИО — не показываем список, пока не начали печатать, и редактирование текста
  // сбрасывает уже выбранную комнату (см. watch(roomId) ниже — вместе с ней сбросится и цена).
  roomId.value = null
  const query = q.trim().toLowerCase()
  roomResults.value = query ? rooms.value.filter((r) => r.room.toLowerCase().includes(query)) : []
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
  submitAttempted.value = false
  serverFieldErrors.value = new Set()
  number.value = ''
  contractDate.value = new Date().toISOString().slice(0, 10)
  startDate.value = ''
  endDate.value = ''
  roomId.value = null
  roomQuery.value = ''
  roomResults.value = []
  rentAmount.value = undefined
  legalRepName.value = ''
  legalRepPhone.value = ''
  legalRepBirthDate.value = ''
  legalRepPassportSeries.value = ''
  legalRepPassportNumber.value = ''
  legalRepPassportIssuedBy.value = ''
  legalRepPassportIssuedCode.value = ''
  legalRepPassportIssuedAt.value = ''
  legalRepSnils.value = ''
  legalRepInn.value = ''
  useMatCapital.value = false
  matCapitalCoveredFrom.value = ''
  matCapitalCoveredTo.value = ''
  matCapitalAmount.value = undefined
  matCapitalDeferredUntil.value = ''
  individualQuery.value = ''
  selectedIndividual.value = null
  individualResults.value = []

  if (rooms.value.length === 0) {
    rooms.value = await fetchRoomsTree()
  }
  const info = await fetchDormitoryInfo()
  dormInfo.value = info
  utilitiesAmount.value = 0
  dailyRateAmount.value = info.dailyPaymentInternal ?? undefined

  isDialogOpen.value = true
}

// Категория определяет, какая суточная ставка по умолчанию (см. DormitoryInfo) — при
// смене категории обновляем подстановку (поле не показывается, но участвует в расчёте пени).
watch(dailyRateCategory, (category) => {
  dailyRateAmount.value = (category === 'OWN_UNIVERSITY' ? dormInfo.value.dailyPaymentInternal : dormInfo.value.dailyPaymentOther) ?? undefined
})

// Подстановка текущей "Стоимости" комнаты как найма по умолчанию (уже с учётом
// коммунальных услуг) — редактируемо сотрудником, при сохранении обратно в комнату не пишется.
watch(roomId, async (id) => {
  if (id === null) {
    // Комнату убрали (очистили поле поиска) — подставленная по ней цена больше не
    // относится к делу, оставлять её как есть было бы обманчиво.
    rentAmount.value = undefined
    return
  }
  const detail = await fetchRoomDetail(id)
  const costCharacteristic = detail.characteristics.find((c) => c.name === 'Стоимость')
  if (costCharacteristic && typeof costCharacteristic.value === 'number') {
    rentAmount.value = costCharacteristic.value
  }
})

async function submitCreate() {
  dialogError.value = ''
  serverFieldErrors.value = new Set()
  submitAttempted.value = true
  // validate() у телефона — сайд-эффект (подсвечивает сам виджет), поэтому вызывается
  // безусловно, а не только внутри && (short-circuit пропустил бы его).
  const phoneValid = phoneInputRef.value?.validate() ?? true
  if (
    !selectedIndividual.value ||
    !roomId.value ||
    !startDate.value ||
    !endDate.value ||
    !number.value.trim() ||
    !contractDate.value ||
    rentAmount.value === undefined ||
    utilitiesAmount.value === undefined ||
    dailyRateAmount.value === undefined ||
    !legalRepName.value.trim() ||
    !phoneValid ||
    (isMinor.value && !legalRepBirthDate.value) ||
    (useMatCapital.value &&
      (!matCapitalCoveredFrom.value ||
        !matCapitalCoveredTo.value ||
        matCapitalAmount.value === undefined ||
        !matCapitalDeferredUntil.value))
  ) {
    dialogError.value = 'Заполните обязательные поля'
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
      legalRepBirthDate: legalRepBirthDate.value || null,
      legalRepPassportSeries: legalRepPassportSeries.value.trim() || null,
      legalRepPassportNumber: legalRepPassportNumber.value.trim() || null,
      legalRepPassportIssuedBy: legalRepPassportIssuedBy.value.trim() || null,
      legalRepPassportIssuedCode: legalRepPassportIssuedCode.value.trim() || null,
      legalRepPassportIssuedAt: legalRepPassportIssuedAt.value || null,
      legalRepSnils: legalRepSnils.value.trim() || null,
      legalRepInn: legalRepInn.value.trim() || null,
      matCapitalCoveredFrom: useMatCapital.value && matCapitalCoveredFrom.value ? matCapitalCoveredFrom.value : null,
      matCapitalCoveredTo: useMatCapital.value && matCapitalCoveredTo.value ? matCapitalCoveredTo.value : null,
      matCapitalAmount: useMatCapital.value && matCapitalAmount.value !== undefined ? matCapitalAmount.value : null,
      matCapitalDeferredUntil: useMatCapital.value && matCapitalDeferredUntil.value ? matCapitalDeferredUntil.value : null,
    })
    isDialogOpen.value = false
    await router.push({ name: 'contract-detail', params: { id: created.id } })
  } catch (error) {
    const parsed = parseApiError(error)
    dialogError.value = parsed.message
    serverFieldErrors.value = parsed.fields
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Договоры найма</h1>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'contractDate', desc: true }"
      :fetch-page="fetchContractsPage"
      :fetch-facet-values="fetchContractFacets"
      :get-row-id="(c: ContractListItem) => String(c.id)"
      total-label="договоров"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="contracts"
      accent-icons
      :row-action="{ icon: ExternalLink, label: 'Открыть договор', getHref: (c: ContractListItem) => `/contracts/${c.id}` }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="openCreate">
              <Plus />
              <span class="sr-only">Новый договор</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Новый договор</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-2xl', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Новый договор найма</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-6">
          <div class="flex flex-col gap-3">
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <FileSignature class="size-4 text-primary" />
              Информация о договоре
            </p>
            <div class="flex flex-col gap-4 rounded-md border p-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                  <Label>Номер договора</Label>
                  <Input v-model="number" :class="numberInvalid ? 'border-red-500' : ''" />
                </div>
                <div class="flex flex-col gap-2">
                  <Label>Дата договора</Label>
                  <DatePickerField v-model="contractDate" :invalid="contractDateInvalid" />
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <Label>Проживающий</Label>
                <SearchSelect
                  v-model="individualQuery"
                  :items="individualResults"
                  :item-key="(i: Individual) => i.fizicheskoyeLitsoUid"
                  :item-label="(i: Individual) => i.fullName"
                  :item-sub-label="(i: Individual) => (i.birthDate ? formatDateIso(i.birthDate) : '')"
                  placeholder="Введите ФИО"
                  :invalid="individualInvalid"
                  :loading="individualSearching"
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
                    placeholder="Введите номер"
                    :invalid="roomInvalid"
                    @search="onRoomSearch"
                    @select="pickRoom"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <Label>Дата начала</Label>
                  <DatePickerField v-model="startDate" :invalid="startDateInvalid" />
                </div>
                <div class="flex flex-col gap-2">
                  <Label>Дата окончания</Label>
                  <DatePickerField v-model="endDate" :invalid="endDateInvalid" />
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <Label>Стоимость</Label>
                <Input
                  v-model.number="rentAmount"
                  type="number"
                  :class="[NO_SPINNER_CLASS, rentAmountInvalid ? 'border-red-500' : '']"
                  @keydown="blockNonNumericKeys"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <UserRound class="size-4 text-primary" />
              Информация о родителе
            </p>
            <div class="flex flex-col gap-4 rounded-md border p-4">
              <!-- ФИО и телефон — всегда, остальное (паспорт, мат.капитал) только для
                   несовершеннолетних (см. isMinor). -->
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                  <Label>ФИО</Label>
                  <Input v-model="legalRepName" :class="legalRepNameInvalid ? 'border-red-500' : ''" />
                </div>
                <div class="flex flex-col gap-2">
                  <Label>Телефон</Label>
                  <PhoneInput ref="phoneInputRef" v-model="legalRepPhone" required />
                </div>
              </div>

              <Transition v-bind="REVEAL_TRANSITION">
                <div v-if="isMinor" class="flex flex-col gap-4">
                  <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-2">
                      <Label>Дата рождения</Label>
                      <DatePickerField v-model="legalRepBirthDate" :invalid="legalRepBirthDateInvalid" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>СНИЛС</Label>
                      <Input v-model="legalRepSnils" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>Паспорт: серия</Label>
                      <Input v-model="legalRepPassportSeries" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>Паспорт: номер</Label>
                      <Input v-model="legalRepPassportNumber" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>Кем выдан</Label>
                      <Input v-model="legalRepPassportIssuedBy" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>Код подразделения</Label>
                      <Input v-model="legalRepPassportIssuedCode" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>Дата выдачи</Label>
                      <DatePickerField v-model="legalRepPassportIssuedAt" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <Label>ИНН</Label>
                      <Input v-model="legalRepInn" />
                    </div>
                  </div>

                  <div
                    class="flex cursor-pointer items-center gap-2 rounded-md p-3 hover:bg-accent"
                    @click="useMatCapital = !useMatCapital"
                  >
                    <Checkbox :model-value="useMatCapital" />
                    <Label class="cursor-pointer font-normal">Оплата материнским капиталом</Label>
                  </div>
                  <Transition v-bind="REVEAL_TRANSITION">
                    <div v-if="useMatCapital" class="flex flex-col gap-4">
                      <div class="flex flex-col gap-2">
                        <Label>Период</Label>
                        <DateRangePickerField
                          v-model:from="matCapitalCoveredFrom"
                          v-model:to="matCapitalCoveredTo"
                          :invalid="matCapitalCoveredFromInvalid || matCapitalCoveredToInvalid"
                        />
                      </div>
                      <div class="grid grid-cols-2 gap-5">
                        <div class="flex flex-col gap-2">
                          <Label>Сумма, ₽</Label>
                          <Input
                            v-model.number="matCapitalAmount"
                            type="number"
                            :class="[NO_SPINNER_CLASS, matCapitalAmountInvalid ? 'border-red-500' : '']"
                            @keydown="blockNonNumericKeys"
                          />
                        </div>
                        <div class="flex flex-col gap-2">
                          <Label>Отсрочка оплаты</Label>
                          <DatePickerField v-model="matCapitalDeferredUntil" :invalid="matCapitalDeferredUntilInvalid" />
                        </div>
                      </div>
                    </div>
                  </Transition>
                </div>
              </Transition>
            </div>
          </div>
        </div>

        <DialogFooter>
          <p v-if="dialogError" class="mr-auto self-center text-sm text-red-500">{{ dialogError }}</p>
          <Button variant="outline" @click="isDialogOpen = false">Отмена</Button>
          <Button :disabled="isSaving" @click="submitCreate">Создать договор</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
