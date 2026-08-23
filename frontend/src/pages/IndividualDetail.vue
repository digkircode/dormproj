<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  X,
  Copy,
  RefreshCw,
  FileSignature,
  Home,
  Phone,
  Mail,
  MapPin,
  Pencil,
  History,
  Save,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DatePickerField from '@/components/DatePickerField.vue'
import PassportTable from '@/components/PassportTable.vue'
import StudentFields from '@/components/StudentFields.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import IndividualHistoryDialog from '@/components/IndividualHistoryDialog.vue'
import { fetchIndividualDetail, syncIndividual, updateIndividual, type IndividualDetail, type IndividualPassport } from '@/lib/individuals-api'
import { copyToClipboard, goBack, blockNonDigitKeys, formatSnils, formatSubdivisionCode, isValidEmailFormat, parseApiError } from '@/lib/utils'
import { breadcrumbOverride } from '@/lib/breadcrumb-state'

const route = useRoute()
const router = useRouter()
const uid = computed(() => String(route.params.uid))

const detail = ref<IndividualDetail | null>(null)
const isLoading = ref(true)
const notFound = ref(false)
const copiedField = ref<'uid' | 'code' | null>(null)
let copyResetTimeout: ReturnType<typeof setTimeout> | undefined

const initials = computed(() =>
  (detail.value?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)

const citizenship = computed(() => detail.value?.citizenships[0] ?? null)
// Ручной ввод (detail.citizenship, см. schema.prisma) — только если нет синхронной записи
// гражданства (у синхронизируемых физлиц она всегда есть, у ручных — никогда).
const citizenshipDisplay = computed(() => citizenship.value?.country ?? detail.value?.citizenship ?? null)

// Паспорт ручного ввода (см. schema.prisma) — не настоящая строка Passport (тот синхрон
// никогда не трогает isManual-физлиц), поэтому синтетическая строка того же вида, только
// для отображения в уже существующей PassportTable.vue. Реальные Passport из 1С (если
// вдруг когда-то появятся у ручного физлица) в приоритете — синтетика только когда
// настоящих документов нет вообще.
const manualPassportRow = computed<IndividualPassport | null>(() => {
  if (!detail.value?.isManual || !detail.value.passportNumber) return null
  return {
    id: -1,
    period: detail.value.passportIssuedAt ?? detail.value.createdAt,
    type: 'Паспорт (введён вручную)',
    series: detail.value.passportSeries ?? '',
    number: detail.value.passportNumber,
    dateStart: detail.value.passportIssuedAt ?? '',
    unit: detail.value.passportIssuedBy ?? '',
    codeUnit: detail.value.passportIssuedCode ?? '',
    systemDoc: '',
  }
})
const passportRows = computed<IndividualPassport[]>(() => {
  if (detail.value && detail.value.passports.length > 0) return detail.value.passports
  return manualPassportRow.value ? [manualPassportRow.value] : []
})
const latestPassport = computed(() => passportRows.value[0] ?? null)
const latestPassportRows = computed(() => (latestPassport.value ? [latestPassport.value] : []))

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

// Type — свободный текст из 1С (см. contact-info-priority.ts на бэкенде), а не enum,
// поэтому сопоставление с иконкой — по вхождению подстроки, не точное совпадение.
// Незнакомый тип — просто без иконки, а не поломка вёрстки.
function contactTypeIcon(type: string) {
  if (type.includes('Адрес')) return Home
  if (type.includes('Телефон')) return Phone
  if (type.includes('Email')) return Mail
  if (type.includes('рождения')) return MapPin
  return null
}

// На карточке нужны все 5 типов всегда, даже без данных у конкретного физлица —
// а не только то, что реально пришло с бэкенда (тот отдаёт по одной актуальной
// записи на тип, но только на те типы, что есть в источнике для этого человека).
const CONTACT_TYPE_ORDER = ['Место рождения', 'Адрес по прописке', 'Адрес места проживания', 'Телефон мобильный', 'Email']

interface ContactRow {
  key: string
  type: string
  predstavleniye: string | null
}

// Поля ручного ввода (phone/email/address, см. schema.prisma) — не отдельные строки
// сбоку, а подстановка в СВОЙ уже существующий тип синхронного блока контактов (иначе
// значения бы дублировались или показывались не на своём месте). У синхронизируемых
// физлиц эти поля всегда null, поэтому фолбэк ничего не меняет для них.
const MANUAL_CONTACT_FALLBACK: Partial<Record<string, () => string | null | undefined>> = {
  'Телефон мобильный': () => detail.value?.phone,
  Email: () => detail.value?.email,
  'Адрес по прописке': () => detail.value?.address,
}

const contactRows = computed<ContactRow[]>(() => {
  const byType = new Map((detail.value?.contactInfos ?? []).map((c) => [c.type, c]))
  const extraTypes = [...byType.keys()].filter((type) => !CONTACT_TYPE_ORDER.includes(type)).sort((a, b) => a.localeCompare(b, 'ru'))
  return [...CONTACT_TYPE_ORDER, ...extraTypes].map((type) => ({
    key: type,
    type,
    predstavleniye: byType.get(type)?.predstavleniye ?? MANUAL_CONTACT_FALLBACK[type]?.() ?? null,
  }))
})

const isSyncing = ref(false)
const syncError = ref('')
// На 2с после завершения — зелёная галочка/красный крестик вместо иконки обновления,
// затем сама возвращается к обычному виду.
const syncFeedback = ref<'success' | 'error' | null>(null)
let syncFeedbackTimeout: ReturnType<typeof setTimeout> | undefined
// disabled снимается синхронно с состоянием (isSyncing/syncFeedback), а иконка ещё
// доигрывает fade out/in (mode="out-in", ~400мс) — без этого флага кнопка становится
// кликабельной раньше, чем иконка успевает вернуться к обычному виду. Ставится в
// before-leave (иконка начала меняться) и снимается в after-enter (новая иконка
// полностью на месте) — см. Transition ниже.
const isSyncIconAnimating = ref(false)

const createDialogRef = ref<InstanceType<typeof CreateContractDialog> | null>(null)
const historyDialogRef = ref<InstanceType<typeof IndividualHistoryDialog> | null>(null)

// "Критическая правка" (STAFF/ADMIN) — без модалки, по прямой просьбе 2026-08-23:
// поля на самой карточке подсвечиваются и становятся полями ввода, кнопки
// Редактировать/История заменяются на Сохранить/Отмена. Пишет напрямую в синхронные
// таблицы (ContactInfo/Passport/Citizenship), см. backend/src/individuals/individual-edit.ts —
// ближайший ночной синхрон синхронизируемых физлиц перезапишет значения обратно из 1С.
const isEditing = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const submitAttempted = ref(false)

const editSurname = ref('')
const editName = ref('')
const editOtchestvo = ref('')
const editBirthDate = ref('')
const editGender = ref<'Мужской' | 'Женский' | ''>('')
const editCitizenship = ref('')
// Ключи — те же contact.type, что уже используются в contactRows (см. computed ниже) —
// один реактивный объект вместо 5 отдельных ref'ов, чтобы в шаблоне можно было
// биндить поле ввода прямо по contact.type (v-model="editContacts[contact.type]"),
// не городя v-if/else-if на 5 веток под один и тот же вид строки.
const editContacts = ref<Record<string, string>>({
  'Место рождения': '',
  'Адрес по прописке': '',
  'Адрес места проживания': '',
  'Телефон мобильный': '',
  Email: '',
})
const editSnils = ref('')
const editInn = ref('')
const editPassportSeries = ref('')
const editPassportNumber = ref('')
const editPassportIssuedBy = ref('')
const editPassportIssuedCode = ref('')
const editPassportIssuedAt = ref('')

// Подсветка поля в режиме редактирования — общий класс на все редактируемые поля карточки.
const EDIT_HIGHLIGHT_CLASS = 'rounded-md -mx-2 -my-1 bg-primary/5 px-2 py-1 ring-1 ring-primary/30'

function onSnilsEditInput(event: Event) {
  const input = event.target as HTMLInputElement
  const formatted = formatSnils(input.value)
  input.value = formatted
  editSnils.value = formatted
}
function onPassportIssuedCodeEditInput(event: Event) {
  const input = event.target as HTMLInputElement
  const formatted = formatSubdivisionCode(input.value)
  input.value = formatted
  editPassportIssuedCode.value = formatted
}

const surnameInvalid = computed(() => submitAttempted.value && !editSurname.value.trim())
const nameInvalid = computed(() => submitAttempted.value && !editName.value.trim())
const birthDateInvalid = computed(() => submitAttempted.value && !editBirthDate.value)
const editEmailValue = computed(() => editContacts.value.Email)
const emailInvalid = computed(() => submitAttempted.value && !!editEmailValue.value.trim() && !isValidEmailFormat(editEmailValue.value.trim()))

function startEdit() {
  if (!detail.value) return
  const d = detail.value
  saveError.value = ''
  submitAttempted.value = false
  const findContact = (type: string) => d.contactInfos.find((c) => c.type === type)?.predstavleniye ?? ''

  editSurname.value = d.surname ?? ''
  editName.value = d.name ?? ''
  editOtchestvo.value = d.otchestvo ?? ''
  editBirthDate.value = d.birthDate ?? ''
  editGender.value = (d.gender as 'Мужской' | 'Женский' | null) ?? ''
  editCitizenship.value = citizenship.value?.country ?? d.citizenship ?? ''
  editContacts.value = {
    'Место рождения': findContact('Место рождения'),
    'Адрес по прописке': findContact('Адрес по прописке') || d.address || '',
    'Адрес места проживания': findContact('Адрес места проживания'),
    'Телефон мобильный': findContact('Телефон мобильный') || d.phone || '',
    Email: findContact('Email') || d.email || '',
  }
  editSnils.value = d.snils ?? ''
  editInn.value = d.inn ?? ''
  const passport = latestPassport.value
  editPassportSeries.value = passport?.series ?? d.passportSeries ?? ''
  editPassportNumber.value = passport?.number ?? d.passportNumber ?? ''
  editPassportIssuedBy.value = passport?.unit ?? d.passportIssuedBy ?? ''
  editPassportIssuedCode.value = passport?.codeUnit ?? d.passportIssuedCode ?? ''
  editPassportIssuedAt.value = passport?.dateStart ?? d.passportIssuedAt ?? ''

  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  saveError.value = ''
}

async function saveEdit() {
  saveError.value = ''
  submitAttempted.value = true
  if (!editSurname.value.trim() || !editName.value.trim() || !editBirthDate.value || emailInvalid.value) {
    saveError.value = 'Заполните обязательные поля'
    return
  }
  isSaving.value = true
  try {
    await updateIndividual(uid.value, {
      surname: editSurname.value.trim(),
      name: editName.value.trim(),
      otchestvo: editOtchestvo.value.trim() || null,
      birthDate: editBirthDate.value,
      gender: editGender.value || null,
      citizenship: editCitizenship.value.trim() || null,
      birthPlace: editContacts.value['Место рождения'].trim() || null,
      phone: editContacts.value['Телефон мобильный'].trim() || null,
      email: editContacts.value.Email.trim() || null,
      registrationAddress: editContacts.value['Адрес по прописке'].trim() || null,
      residenceAddress: editContacts.value['Адрес места проживания'].trim() || null,
      snils: editSnils.value.trim() || null,
      inn: editInn.value.trim() || null,
      passportSeries: editPassportSeries.value.trim() || null,
      passportNumber: editPassportNumber.value.trim() || null,
      passportIssuedBy: editPassportIssuedBy.value.trim() || null,
      passportIssuedCode: editPassportIssuedCode.value.trim() || null,
      passportIssuedAt: editPassportIssuedAt.value || null,
    })
    isEditing.value = false
    detail.value = await fetchIndividualDetail(uid.value)
  } catch (error) {
    saveError.value = parseApiError(error).message
  } finally {
    isSaving.value = false
  }
}

// Перезапрашиваем всю карточку после успешной синхронизации — синхрон затрагивает
// сразу 5 источников (студент/физлицо/гражданство/паспорт/контакты), проще перечитать
// всё разом, чем точечно обновлять каждый раздел.
async function runSync() {
  if (isSyncing.value) return
  isSyncing.value = true
  syncError.value = ''
  try {
    await syncIndividual(uid.value)
    detail.value = await fetchIndividualDetail(uid.value)
    syncFeedback.value = 'success'
  } catch (error) {
    syncError.value = error instanceof Error ? error.message : String(error)
    syncFeedback.value = 'error'
  } finally {
    isSyncing.value = false
    clearTimeout(syncFeedbackTimeout)
    syncFeedbackTimeout = setTimeout(() => (syncFeedback.value = null), 2000)
  }
}

async function copyValue(field: 'uid' | 'code', value: string | null | undefined) {
  if (!value) return
  await copyToClipboard(value)
  copiedField.value = field
  clearTimeout(copyResetTimeout)
  copyResetTimeout = setTimeout(() => (copiedField.value = null), 1500)
}

onMounted(async () => {
  try {
    detail.value = await fetchIndividualDetail(uid.value)
    breadcrumbOverride.value = detail.value.fullName
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
})
onUnmounted(() => {
  breadcrumbOverride.value = null
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/individuals')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Информация о физическом лице</h1>
    </div>

    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
    <p v-else-if="notFound" class="text-sm text-red-500">Физлицо не найдено</p>

    <template v-else-if="detail">
      <!-- Card по умолчанию не flex-контейнер (см. заметки проекта) — здесь несколько
           дочерних блоков подряд, поэтому flex flex-col обязателен, иначе gap/divide
           между ними ничего не делает. Один Card с внутренним разделителем на 3 части
           (не отдельные Card рядом) — по просьбе пользователя: слева личность+кнопки,
           посередине атрибуты физлица, справа — контактная информация (без даты,
           та осталась только у документов/обучения). -->
      <Card class="flex flex-col divide-y divide-border p-6 lg:flex-row lg:divide-x lg:divide-y-0">
        <div class="flex flex-col gap-4 pb-4 lg:w-96 lg:shrink-0 lg:pb-0 lg:pr-6">
          <div class="flex items-start gap-4">
            <!-- Синхрона фотографий из 1С пока нет — заглушка с инициалами, как в NavUser -->
            <Avatar class="size-20">
              <AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
            </Avatar>
            <div class="flex flex-col gap-1 pt-1">
              <div v-if="!isEditing" class="text-xl font-semibold">{{ detail.fullName }}</div>
              <div v-else :class="EDIT_HIGHLIGHT_CLASS" class="grid grid-cols-3 gap-1.5">
                <Input v-model="editSurname" placeholder="Фамилия" class="h-8 text-sm" :class="surnameInvalid ? 'border-red-500' : ''" />
                <Input v-model="editName" placeholder="Имя" class="h-8 text-sm" :class="nameInvalid ? 'border-red-500' : ''" />
                <Input v-model="editOtchestvo" placeholder="Отчество" class="h-8 text-sm" />
              </div>
              <!-- Копирование UID/кода 1С — только у синхронизируемых физлиц, у ручных
                   (isManual) это не настоящий код/guid из 1С, а синтетический
                   технический ключ, копировать его пользователю незачем. -->
              <template v-if="!detail.isManual">
                <button
                  type="button"
                  class="grid w-fit items-center text-xs text-muted-foreground hover:text-foreground"
                  @click="copyValue('uid', detail.fizicheskoyeLitsoUid)"
                >
                  <Transition enter-active-class="animate-in fade-in-0 duration-200" leave-active-class="animate-out fade-out-0 duration-200">
                    <span v-if="copiedField === 'uid'" key="copied" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Check class="size-3.5 shrink-0 text-emerald-500" />
                      <span>Скопировано</span>
                    </span>
                    <span v-else key="value" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Copy class="size-3.5 shrink-0" />
                      <span>{{ detail.fizicheskoyeLitsoUid }}</span>
                    </span>
                  </Transition>
                </button>
                <button
                  type="button"
                  class="grid w-fit items-center text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  :disabled="!detail.code"
                  @click="copyValue('code', detail.code)"
                >
                  <Transition enter-active-class="animate-in fade-in-0 duration-200" leave-active-class="animate-out fade-out-0 duration-200">
                    <span v-if="copiedField === 'code'" key="copied" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Check class="size-3.5 shrink-0 text-emerald-500" />
                      <span>Скопировано</span>
                    </span>
                    <span v-else key="value" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Copy class="size-3.5 shrink-0" />
                      <span>{{ detail.code ?? '—' }}</span>
                    </span>
                  </Transition>
                </button>
              </template>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" :disabled="isSyncing || syncFeedback !== null || isSyncIconAnimating || isEditing" @click="runSync">
              <Transition
                enter-active-class="animate-in fade-in-0 duration-200"
                leave-active-class="animate-out fade-out-0 duration-200"
                mode="out-in"
                @before-leave="isSyncIconAnimating = true"
                @after-enter="isSyncIconAnimating = false"
              >
                <Check v-if="syncFeedback === 'success'" key="success" class="text-emerald-500" />
                <X v-else-if="syncFeedback === 'error'" key="error" class="text-red-500" />
                <RefreshCw v-else key="refresh" class="text-primary" :class="{ 'animate-spin': isSyncing }" />
              </Transition>
              Синхронизировать
            </Button>
            <Button size="sm" :disabled="isEditing" @click="detail && createDialogRef?.open(detail)">
              <FileSignature />
              Создать договор
            </Button>
            <Button variant="outline" size="sm" :disabled="isEditing" @click="startEdit">
              <Pencil class="text-primary" />
              Редактировать
            </Button>
            <Button variant="outline" size="sm" :disabled="isEditing" @click="historyDialogRef?.open(uid)">
              <History class="text-primary" />
              История
            </Button>
            <template v-if="isEditing">
              <Button variant="outline" size="sm" :disabled="isSaving" @click="cancelEdit">
                <X class="text-primary" />
                Отмена
              </Button>
              <Button size="sm" :loading="isSaving" @click="saveEdit">
                <Save />
                Сохранить
              </Button>
            </template>
          </div>
          <p v-if="syncError" class="text-sm text-red-500">{{ syncError }}</p>
          <p v-if="saveError" class="text-sm text-red-500">{{ saveError }}</p>
        </div>

        <!-- Контактная информация — тем же способом схлопнута бэкендом до одной
             актуальной записи на тип (см. contactRows/pickLatestContactInfo), дата
             здесь не нужна (она осталась только у документов/обучения). -->
        <div class="flex flex-col divide-y divide-border py-4 lg:min-w-0 lg:flex-1 lg:py-0 lg:px-6">
          <div
            v-for="contact in contactRows"
            :key="contact.key"
            class="flex items-start gap-2 py-2 text-sm first:pt-0 last:pb-0"
            :class="isEditing ? EDIT_HIGHLIGHT_CLASS : ''"
          >
            <span class="flex w-40 shrink-0 items-center gap-1.5 text-muted-foreground">
              <component :is="contactTypeIcon(contact.type)" v-if="contactTypeIcon(contact.type)" class="size-4 shrink-0 text-primary" />
              {{ contact.type }}
            </span>
            <span v-if="!isEditing">{{ contact.predstavleniye || '—' }}</span>
            <Input
              v-else-if="contact.type === 'Email'"
              v-model="editContacts[contact.type]"
              type="email"
              class="h-8 flex-1 text-sm"
              :class="emailInvalid ? 'border-red-500' : ''"
            />
            <Input v-else v-model="editContacts[contact.type]" class="h-8 flex-1 text-sm" />
          </div>
        </div>

        <div class="flex flex-col divide-y divide-border pt-4 lg:w-64 lg:shrink-0 lg:pt-0 lg:pl-6">
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0" :class="isEditing ? EDIT_HIGHLIGHT_CLASS : ''">
            <span class="text-muted-foreground">Гражданство</span>
            <span v-if="!isEditing">{{ citizenshipDisplay ?? '—' }}</span>
            <Input v-else v-model="editCitizenship" class="h-8 w-32 text-sm" />
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0" :class="isEditing ? EDIT_HIGHLIGHT_CLASS : ''">
            <span class="text-muted-foreground">Дата рождения</span>
            <span v-if="!isEditing">{{ formatDate(detail.birthDate) }}</span>
            <DatePickerField v-else v-model="editBirthDate" class="w-32" :invalid="birthDateInvalid" />
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0" :class="isEditing ? EDIT_HIGHLIGHT_CLASS : ''">
            <span class="text-muted-foreground">Пол</span>
            <span v-if="!isEditing">{{ detail.gender ?? '—' }}</span>
            <Select v-else :model-value="editGender || undefined" @update:model-value="(v) => (editGender = v as 'Мужской' | 'Женский')">
              <SelectTrigger class="h-8 w-32 text-sm">
                <SelectValue placeholder="Не указан" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Мужской">Мужской</SelectItem>
                <SelectItem value="Женский">Женский</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0" :class="isEditing ? EDIT_HIGHLIGHT_CLASS : ''">
            <span class="text-muted-foreground">СНИЛС</span>
            <span v-if="!isEditing">{{ detail.snils ?? '—' }}</span>
            <input
              v-else
              :value="editSnils"
              class="flex h-8 w-32 rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20"
              placeholder="000-000-000 00"
              @input="onSnilsEditInput"
              @keydown="blockNonDigitKeys"
            />
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0" :class="isEditing ? EDIT_HIGHLIGHT_CLASS : ''">
            <span class="text-muted-foreground">ИНН</span>
            <span v-if="!isEditing">{{ detail.inn ?? '—' }}</span>
            <Input v-else v-model="editInn" class="h-8 w-32 text-sm" />
          </div>
        </div>
      </Card>

      <!-- Заголовки вынесены за рамку карточки, как ФИО в шапке страницы, а не втиснуты
           внутрь Card рядом с вкладками — тот же размер шрифта, что у ФИО (text-lg). -->
      <div class="text-lg font-medium">Документы удостоверяющие личность</div>

      <Card class="p-6">
        <Tabs default-value="latest">
          <TabsList>
            <TabsTrigger value="latest">Актуальный</TabsTrigger>
            <TabsTrigger value="all" class="gap-1.5">
              Все
              <Badge variant="secondary">{{ passportRows.length }}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="latest">
            <PassportTable v-if="!isEditing" :passports="latestPassportRows" />
            <!-- Правка — только актуального документа (та же запись, что обновляет
                 upsertPassport на бэкенде), история во вкладке "Все" остаётся read-only. -->
            <div v-else class="grid grid-cols-2 gap-4 rounded-md p-3" :class="EDIT_HIGHLIGHT_CLASS">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-muted-foreground">Серия</label>
                <Input v-model="editPassportSeries" class="h-8 text-sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-muted-foreground">Номер</label>
                <Input v-model="editPassportNumber" class="h-8 text-sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-muted-foreground">Код подразделения</label>
                <input
                  :value="editPassportIssuedCode"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20"
                  placeholder="000-000"
                  @input="onPassportIssuedCodeEditInput"
                  @keydown="blockNonDigitKeys"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-muted-foreground">Дата выдачи</label>
                <DatePickerField v-model="editPassportIssuedAt" />
              </div>
              <div class="col-span-2 flex flex-col gap-1.5">
                <label class="text-xs text-muted-foreground">Кем выдан</label>
                <Input v-model="editPassportIssuedBy" class="h-8 text-sm" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="all">
            <PassportTable :passports="passportRows" />
          </TabsContent>
        </Tabs>
      </Card>

      <div class="text-lg font-medium">Обучение</div>

      <Card class="p-6">
        <p v-if="!detail.students.length" class="text-sm text-muted-foreground">Нет данных</p>

        <!-- Вкладка с номером зачётки — всегда, даже если зачётка одна, а не StudentFields
           напрямую: так вкладка сама подписывает, какой зачётке принадлежат поля. -->
        <Tabs v-else :default-value="detail.students[0].zachetnayaKnigaUid">
          <TabsList class="h-auto flex-wrap">
            <TabsTrigger
              v-for="student in detail.students"
              :key="student.zachetnayaKnigaUid"
              :value="student.zachetnayaKnigaUid"
            >
              {{ student.zachetnayaKniga }}
            </TabsTrigger>
          </TabsList>
          <TabsContent v-for="student in detail.students" :key="student.zachetnayaKnigaUid" :value="student.zachetnayaKnigaUid">
            <StudentFields :student="student" />
          </TabsContent>
        </Tabs>
      </Card>
    </template>

    <CreateContractDialog ref="createDialogRef" />
    <IndividualHistoryDialog ref="historyDialogRef" />
  </div>
</template>
