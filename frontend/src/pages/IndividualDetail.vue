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
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import PassportTable from '@/components/PassportTable.vue'
import StudentFields from '@/components/StudentFields.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import EditIndividualDialog from '@/components/EditIndividualDialog.vue'
import IndividualHistoryDialog from '@/components/IndividualHistoryDialog.vue'
import { fetchIndividualDetail, syncIndividual, type IndividualDetail, type IndividualPassport } from '@/lib/individuals-api'
import { copyToClipboard, goBack } from '@/lib/utils'
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
const editDialogRef = ref<InstanceType<typeof EditIndividualDialog> | null>(null)
const historyDialogRef = ref<InstanceType<typeof IndividualHistoryDialog> | null>(null)

// После сохранения правки перечитываем всю карточку (проще, чем точечно
// синхронизировать локальное состояние с тем, что реально записалось в БД).
async function onIndividualSaved() {
  detail.value = await fetchIndividualDetail(uid.value)
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
          <!-- items-center для ручных физлиц — у них под ФИО нет строк копирования
               uid/кода (см. v-if ниже), значение единственное в колонке, и ФИО должно
               идти по центру аватарки, а не примыкать к её верху, как у синхронных. -->
          <div class="flex gap-4" :class="detail.isManual ? 'items-center' : 'items-start'">
            <!-- Синхрона фотографий из 1С пока нет — заглушка с инициалами, как в NavUser -->
            <Avatar class="size-20">
              <AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
            </Avatar>
            <div class="flex flex-col gap-1" :class="detail.isManual ? '' : 'pt-1'">
              <div class="text-xl font-semibold">{{ detail.fullName }}</div>
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

          <!-- grid-cols-2 — все 4 кнопки одинаковой ширины (по самой длинной, "Синхронизировать")
               и с одинаковыми отступами по обеим осям (gap-2), а не по содержимому, как раньше. -->
          <div class="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              class="w-full"
              :disabled="isSyncing || syncFeedback !== null || isSyncIconAnimating"
              @click="runSync"
            >
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
            <Button size="sm" class="w-full" @click="detail && createDialogRef?.open(detail)">
              <FileSignature />
              Создать договор
            </Button>
            <Button variant="outline" size="sm" class="w-full" @click="detail && editDialogRef?.open(detail)">
              <Pencil class="text-primary" />
              Редактировать
            </Button>
            <Button variant="outline" size="sm" class="w-full" @click="historyDialogRef?.open(uid)">
              <History class="text-primary" />
              История
            </Button>
          </div>
          <p v-if="syncError" class="text-sm text-red-500">{{ syncError }}</p>
        </div>

        <!-- Контактная информация — тем же способом схлопнута бэкендом до одной
             актуальной записи на тип (см. contactRows/pickLatestContactInfo), дата
             здесь не нужна (она осталась только у документов/обучения). -->
        <div class="flex flex-col divide-y divide-border py-4 lg:min-w-0 lg:flex-1 lg:py-0 lg:px-6">
          <div
            v-for="contact in contactRows"
            :key="contact.key"
            class="flex items-start gap-2 py-2 text-sm first:pt-0 last:pb-0"
          >
            <span class="flex w-40 shrink-0 items-center gap-1.5 text-muted-foreground">
              <component :is="contactTypeIcon(contact.type)" v-if="contactTypeIcon(contact.type)" class="size-4 shrink-0 text-primary" />
              {{ contact.type }}
            </span>
            <span>{{ contact.predstavleniye || '—' }}</span>
          </div>
        </div>

        <div class="flex flex-col divide-y divide-border pt-4 lg:w-64 lg:shrink-0 lg:pt-0 lg:pl-6">
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">Гражданство</span>
            <span>{{ citizenshipDisplay ?? '—' }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">Дата рождения</span>
            <span>{{ formatDate(detail.birthDate) }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">Пол</span>
            <span>{{ detail.gender ?? '—' }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">СНИЛС</span>
            <span>{{ detail.snils ?? '—' }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">ИНН</span>
            <span>{{ detail.inn ?? '—' }}</span>
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
            <PassportTable :passports="latestPassportRows" />
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
    <EditIndividualDialog ref="editDialogRef" @saved="onIndividualSaved" />
    <IndividualHistoryDialog ref="historyDialogRef" />
  </div>
</template>
