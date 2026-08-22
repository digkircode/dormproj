<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FileSignature, UserRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import DatePickerField from '@/components/DatePickerField.vue'
import DateRangePickerField from '@/components/DateRangePickerField.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import PhoneInput from '@/components/PhoneInput.vue'
import { createContract, fetchLegalRepPrefill, type DailyRateCategory } from '@/lib/contracts-api'
import { fetchIndividuals, fetchIndividualDetail, type Individual } from '@/lib/individuals-api'
import { fetchRoomsTree, fetchRoomDetail, type RoomTreeItem } from '@/lib/rooms-api'
import { fetchDormitoryInfo } from '@/lib/dormitory-info-api'
import { blockNonNumericKeys, parseApiError } from '@/lib/utils'

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
// Пока проживающий не выбран, категория не определена по-настоящему — значение выше
// чисто техническое стартовое, не факт о человеке. "Причина проживания" в шаблоне
// смотрит на этот флаг, а не только на dailyRateCategory, иначе поле появлялось бы
// по умолчанию ещё до выбора проживающего.
const dailyRateCategoryKnown = ref(false)
const dailyRateAmount = ref<number | undefined>(undefined)
// Причина проживания — печатается в п.1.2 бланка вместо "обучением в АНО ВО «РосНОУ»",
// нужна только когда проживающий не из своего вуза (см. dailyRateCategory).
const residenceReason = ref('')
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
const legalRepAddress = ref('')

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

// parseApiError — общий хелпер (см. lib/utils.ts), тут только серверные ошибки конкретной
// формы. Поля, на которые сервер пожаловался типом/форматом в последней попытке сохранить —
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
const residenceReasonInvalid = computed(
  () => submitAttempted.value && dailyRateCategory.value === 'OTHER_UNIVERSITY' && !residenceReason.value.trim(),
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
  // dailyRateCategoryKnown до этого момента false — иначе "Причина проживания" мелькала
  // бы по умолчанию ещё до выбора проживающего (дефолт dailyRateCategory — OTHER_UNIVERSITY,
  // см. ref ниже, чисто техническое стартовое значение, не факт о человеке).
  try {
    const detail = await fetchIndividualDetail(ind.fizicheskoyeLitsoUid)
    dailyRateCategory.value = detail.students.length > 0 ? 'OWN_UNIVERSITY' : 'OTHER_UNIVERSITY'
  } catch {
    dailyRateCategory.value = 'OTHER_UNIVERSITY'
  } finally {
    dailyRateCategoryKnown.value = true
  }
}

// Автоподстановка родителя — если у этого несовершеннолетнего родитель уже вводился на
// предыдущем договоре (см. Individual(isManual) в contracts.controller.ts), заполняем
// пустые поля блока родителя его данными. Не перетираем то, что сотрудник уже успел
// ввести вручную.
watch(isMinor, async (minor) => {
  if (!minor || !selectedIndividual.value) return
  const prefill = await fetchLegalRepPrefill(selectedIndividual.value.fizicheskoyeLitsoUid).catch(() => null)
  if (!prefill) return
  if (!legalRepName.value.trim() && prefill.legalRepName) legalRepName.value = prefill.legalRepName
  if (!legalRepPhone.value.trim() && prefill.legalRepPhone) legalRepPhone.value = prefill.legalRepPhone
  if (!legalRepBirthDate.value && prefill.legalRepBirthDate) legalRepBirthDate.value = prefill.legalRepBirthDate.slice(0, 10)
  if (!legalRepPassportSeries.value.trim() && prefill.legalRepPassportSeries) legalRepPassportSeries.value = prefill.legalRepPassportSeries
  if (!legalRepPassportNumber.value.trim() && prefill.legalRepPassportNumber) legalRepPassportNumber.value = prefill.legalRepPassportNumber
  if (!legalRepPassportIssuedBy.value.trim() && prefill.legalRepPassportIssuedBy) legalRepPassportIssuedBy.value = prefill.legalRepPassportIssuedBy
  if (!legalRepPassportIssuedCode.value.trim() && prefill.legalRepPassportIssuedCode) legalRepPassportIssuedCode.value = prefill.legalRepPassportIssuedCode
  if (!legalRepPassportIssuedAt.value && prefill.legalRepPassportIssuedAt) legalRepPassportIssuedAt.value = prefill.legalRepPassportIssuedAt.slice(0, 10)
  if (!legalRepSnils.value.trim() && prefill.legalRepSnils) legalRepSnils.value = prefill.legalRepSnils
  if (!legalRepInn.value.trim() && prefill.legalRepInn) legalRepInn.value = prefill.legalRepInn
  if (!legalRepAddress.value.trim() && prefill.legalRepAddress) legalRepAddress.value = prefill.legalRepAddress
})

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

// Договор не может длиться больше года — дата окончания всегда 30.08, того же года,
// если старт до этой даты включительно, иначе уже следующего (учебный/арендный год
// заканчивается 30 августа). Сравнение по строке 'YYYY-MM-DD' напрямую, не через
// new Date(...), чтобы не словить сдвиг на часовой пояс между UTC-парсингом ISO-строки
// и локальной конструкцией даты.
function defaultEndDate(from: string): string {
  const [yearStr, monthStr, dayStr] = from.split('-')
  const year = Number(yearStr)
  const isBeforeOrOnAug30 = Number(monthStr) < 8 || (Number(monthStr) === 8 && Number(dayStr) <= 30)
  return `${isBeforeOrOnAug30 ? year : year + 1}-08-30`
}

// Дата окончания подставляется автоматически при каждом выборе даты начала —
// по прямой просьбе, сотрудник может поправить её вручную после подстановки.
watch(startDate, (value) => {
  if (value) endDate.value = defaultEndDate(value)
})

// prefillIndividual — открытие диалога сразу с выбранным проживающим (карточка физлица,
// кнопка "Создать договор") — минует шаг поиска, дальше форма ведёт себя как обычно.
async function open(prefillIndividual?: Individual) {
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
  residenceReason.value = ''
  dailyRateCategoryKnown.value = false
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
  legalRepAddress.value = ''
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

  if (prefillIndividual) {
    await pickIndividual(prefillIndividual)
  }

  isDialogOpen.value = true
}

defineExpose({ open })

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
    (dailyRateCategory.value === 'OTHER_UNIVERSITY' && !residenceReason.value.trim()) ||
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
      residenceReason: dailyRateCategory.value === 'OTHER_UNIVERSITY' ? residenceReason.value.trim() || null : null,
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
      legalRepAddress: legalRepAddress.value.trim() || null,
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

            <!-- Только для не-своего вуза — печатается в п.1.2 бланка вместо "обучением
                 в АНО ВО «РосНОУ»" (см. dailyRateCategory, автоопределяется в pickIndividual). -->
            <Transition v-bind="REVEAL_TRANSITION">
              <div v-if="dailyRateCategoryKnown && dailyRateCategory === 'OTHER_UNIVERSITY'" class="flex flex-col gap-2">
                <Label>Причина проживания</Label>
                <Input v-model="residenceReason" :class="residenceReasonInvalid ? 'border-red-500' : ''" />
              </div>
            </Transition>
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
                  <div class="col-span-2 flex flex-col gap-2">
                    <Label>Адрес регистрации</Label>
                    <Input v-model="legalRepAddress" />
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
        <Button :loading="isSaving" @click="submitCreate">Создать договор</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
