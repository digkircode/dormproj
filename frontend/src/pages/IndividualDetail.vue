<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Check, Copy, RefreshCw, FileSignature, Wallet, DoorOpen, Home, Phone, Mail, MapPin } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import PassportTable from '@/components/PassportTable.vue'
import StudentFields from '@/components/StudentFields.vue'
import { fetchIndividualDetail, type IndividualDetail } from '@/lib/individuals-api'
import { copyToClipboard } from '@/lib/utils'

const route = useRoute()
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
const latestPassport = computed(() => detail.value?.passports[0] ?? null)
const latestPassportRows = computed(() => (latestPassport.value ? [latestPassport.value] : []))

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

// Контактная информация: 1С отдаёт "0001-01-01" как "дата не задана" вместо null
// (см. ContactInfo.vue) — такое показываем как "—", а не 01.01.0001.
function formatContactDate(iso: string): string {
  const date = new Date(iso)
  if (date.getUTCFullYear() <= 1) return '—'
  return formatDate(iso)
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
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" as-child>
        <RouterLink to="/individuals">
          <ArrowLeft />
          <span class="sr-only">К физическим лицам</span>
        </RouterLink>
      </Button>
      <h1 class="text-lg font-medium">Информация о физическом лице</h1>
    </div>

    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
    <p v-else-if="notFound" class="text-sm text-red-500">Физлицо не найдено</p>

    <template v-else-if="detail">
      <!-- Card по умолчанию не flex-контейнер (см. заметки проекта) — здесь несколько
           дочерних блоков подряд, поэтому flex flex-col обязателен, иначе gap/divide
           между ними ничего не делает. Один Card с внутренним разделителем (не два
           отдельных Card рядом) — по просьбе пользователя. -->
      <Card class="flex flex-col divide-y divide-border p-6 lg:flex-row lg:divide-x lg:divide-y-0">
        <div class="flex flex-1 flex-col gap-4 pb-4 lg:pb-0 lg:pr-6">
          <div class="flex items-start gap-4">
            <!-- Синхрона фотографий из 1С пока нет — заглушка с инициалами, как в NavUser -->
            <Avatar class="size-20">
              <AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
            </Avatar>
            <div class="flex flex-col gap-1 pt-1">
              <div class="text-xl font-semibold">{{ detail.fullName }}</div>
              <button
                type="button"
                class="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                @click="copyValue('uid', detail.fizicheskoyeLitsoUid)"
              >
                <component :is="copiedField === 'uid' ? Check : Copy" class="size-3.5 shrink-0" />
                <span>{{ detail.fizicheskoyeLitsoUid }}</span>
              </button>
              <button
                type="button"
                class="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                :disabled="!detail.code"
                @click="copyValue('code', detail.code)"
              >
                <component :is="copiedField === 'code' ? Check : Copy" class="size-3.5 shrink-0" />
                <span>{{ detail.code ?? '—' }}</span>
              </button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw />
              Синхронизировать
            </Button>
            <Button size="sm">
              <FileSignature />
              Составить договор
            </Button>
            <Button variant="outline" size="sm">
              <Wallet />
              Просмотр оплаты
            </Button>
            <Button variant="outline" size="sm">
              <DoorOpen />
              Просмотр комнаты
            </Button>
          </div>
        </div>

        <div class="flex flex-col divide-y divide-border pt-4 lg:w-80 lg:shrink-0 lg:pt-0 lg:pl-6">
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">Гражданство</span>
            <span>{{ citizenship?.country ?? '—' }}</span>
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
              <Badge variant="secondary">{{ detail.passports.length }}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="latest">
            <PassportTable :passports="latestPassportRows" />
          </TabsContent>

          <TabsContent value="all">
            <PassportTable :passports="detail.passports" />
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

      <div class="text-lg font-medium">Контактная информация</div>

      <!-- По каждому типу источник может отдавать несколько строк (дубли, устаревшие,
           пустые записи) — бэкенд уже схлопнул их до одной актуальной на тип
           (pickLatestContactInfo), поэтому здесь просто список без вкладок. Табличную
           шапку убрали по просьбе — "тип"/"значение"/"дата" и так понятны без подписей
           колонок. Страна/Регион/Город намеренно не показываем — они ненадёжны
           (см. бэкенд), текстовое "Значение" (predstavleniye) покрывает то же самое
           надёжнее. -->
      <Card class="p-6">
        <div v-if="detail.contactInfos.length" class="flex flex-col divide-y divide-border">
          <div
            v-for="contact in detail.contactInfos"
            :key="contact.id"
            class="flex flex-col gap-1 py-2 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
          >
            <div class="flex w-48 shrink-0 items-center gap-2 text-muted-foreground">
              <component :is="contactTypeIcon(contact.type)" v-if="contactTypeIcon(contact.type)" class="size-4 shrink-0" />
              <span>{{ contact.type }}</span>
            </div>
            <div class="flex-1">{{ contact.predstavleniye || '—' }}</div>
            <div class="shrink-0 text-muted-foreground sm:w-28 sm:text-right">{{ formatContactDate(contact.dateStart) }}</div>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">Нет данных</p>
      </Card>
    </template>
  </div>
</template>
