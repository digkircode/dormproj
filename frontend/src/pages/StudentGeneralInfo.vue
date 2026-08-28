<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Users,
  Building2,
  Wifi,
  Accessibility,
  Wallet,
  Banknote,
  Contact,
  FileText,
  Stethoscope,
  GraduationCap,
  ChevronRight,
  ArrowLeft,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { fetchHostelPublicInfo, type HostelPublicInfo } from '@/lib/public-info-api'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
// Компонент рендерится и как /student/general-info, и как содержимое "Главной" для
// пользователей без роли (см. Home.vue) — на "Главной" стрелка "назад" не нужна.
const isHome = computed(() => route.name === 'home')
import molPhoto from '@/assets/staff/mol.webp'
import cicPhoto from '@/assets/staff/cic.webp'
import jilPhoto from '@/assets/staff/jil.webp'
import isaPhoto from '@/assets/staff/isa.webp'
import guzPhoto from '@/assets/staff/guz.jpg'
import butPhoto from '@/assets/staff/but.jpg'

// Контент дословно взят со страницы https://rosnou.ru/university/hostel/ (по прямой
// просьбе — эта страница показывает официальную информацию об общежитии как есть, без
// отсебятины). Обновлять вручную при изменениях на сайте вуза — автосинхронизации нет.
// Исключение — "Стоимость проживания" ниже: цифры реальные, из БД (см. hostelInfo).
// Три вкладки (2026-08-23, второй раунд) — вместо одной длинной ленты карточек.

interface StaffPerson {
  name: string
  photo?: string
}

// value — фактические контактные данные (адрес/телефон/email), не переводится, как
// значения других реквизитных полей в проекте (см. "что осознанно НЕ локализуется" в
// промпте) — только label вокруг них.
const contacts = computed(() => [
  { icon: MapPin, label: t('student.contactsAdmin.addressLabel'), value: 'г. Москва, ул. Авиамоторная, д. 55, корп. 5' },
  { icon: Phone, label: t('student.contactsAdmin.phoneLabel'), value: '+7 (977) 812-81-87, +7 (495) 223-40-49' },
  { icon: Mail, label: t('student.contactsAdmin.emailLabel'), value: 'hostel@rosnou.ru' },
  { icon: Clock, label: t('student.contactsAdmin.hoursLabel'), value: '9:30–18:00' },
])

// photo — файлы получены от пользователя 2026-08-23 с говорящими именами (mol/cic/jil/isa/
// guz/but — по фамилии), сопоставление подтверждено, не гадали по внешности.
const staff: StaffPerson[] = [
  { name: 'Молоствова Наталья Константиновна', photo: molPhoto },
  { name: 'Цицерова Марина Викторовна', photo: cicPhoto },
  { name: 'Жилякова Татьяна Анатольевна', photo: jilPhoto },
  { name: 'Исаева Наталья Анатольевна', photo: isaPhoto },
]

const ddm = computed(() => [
  { icon: MapPin, label: t('student.contactsAdmin.addressLabel'), value: 'г. Москва, ул. Радио, д. 22, каб. 801' },
  { icon: Phone, label: t('student.contactsAdmin.phoneLabel'), value: '+7 (495) 925-03-71 (вн. 211)' },
  { icon: Mail, label: t('student.contactsAdmin.emailLabel'), value: 'ddm@rosnou.ru, hostel@rosnou.ru' },
  { icon: Clock, label: t('student.contactsAdmin.hoursLabel'), value: 'Пн–Пт 10:00–18:00' },
])

const ddmStaff: StaffPerson[] = [
  { name: 'Буторова Наталья Владимировна', photo: butPhoto },
  { name: 'Гузенко Виктория Владимировна', photo: guzPhoto },
]

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

// "Здание" — развёрнутым текстом, не краткими буллетами (по прямой просьбе 2026-08-23:
// после переноса "Доступности" в правую колонку слева стало заметно меньше текста, чем
// справа — расписали подробнее, не сокращая присланный пользователем текст про крылья/
// обстановку комнат до одной строки, как было раньше).
const buildingParagraphs = computed(() => [
  t('student.building.paragraph1'),
  t('student.building.paragraph2'),
  t('student.building.paragraph3'),
  t('student.building.paragraph4'),
])

const infrastructure = computed(() => [
  t('student.infrastructure.item1'),
  t('student.infrastructure.item2'),
  t('student.infrastructure.item3'),
  t('student.infrastructure.item4'),
  t('student.infrastructure.item5'),
  t('student.infrastructure.item6'),
])

const tempRegistrationDocuments = computed(() => [
  t('student.tempRegistration.doc1'),
  t('student.tempRegistration.doc2'),
  t('student.tempRegistration.doc3'),
  t('student.tempRegistration.doc4'),
])

// "Шпаргалка" — добавлено 2026-08-23 по присланному пользователем тексту, сжато до
// пошагового списка (само собой разумеющееся вступление про иногородних/список
// документов уже было на странице абзацем выше — не дублировали).
const polyclinicSteps = computed(() => [t('student.polyclinic.step1'), t('student.polyclinic.step2'), t('student.polyclinic.step3')])

const polyclinicsOpen = ref(false)

const polyclinics = [
  { name: 'Городская поликлиника № 129', address: 'ул. Ладожская, д. 4/6, стр. 1', phone: '+7 499 261-98-71' },
  { name: 'ГБУЗ «ДЦ № 3 ДЗМ», филиал № 3', address: 'Таможенный пр., д. 3', phone: '+7 495 362-85-70' },
  { name: 'Городская поликлиника № 133', address: 'Юрьевский пер., д. 13', phone: '+7 495 360-76-98' },
  { name: 'Детская поликлиника № 61, филиал 3 (ДГП № 115)', address: 'ул. 2-я Синичкина, д. 6', phone: null as string | null },
]

// --- Стоимость проживания — реальные числа из БД (характеристики комнат + настройки
// общежития), не текст руками, см. backend/src/public-info/public-info.controller.ts ---
const hostelInfo = ref<HostelPublicInfo | null>(null)
const hostelInfoError = ref('')
const isHostelInfoLoading = ref(true)

// Склонение "человек" — реальные вместимости комнат в общежитии от 2 до 5, но формула
// общая (стандартное правило русского числительного), не завязана на этот диапазон.
// Для EN своя, гораздо более простая пара форм (person/people) — библиотечной
// (vue-i18n) плюрализации под русские 3 формы в проекте нигде больше не заводили
// (см. приём с "N дн." в отчётах/синхронизации), поэтому и здесь решается вручную в JS.
function roomLabel(capacity: number): string {
  let unit: string
  if (locale.value === 'en') {
    unit = capacity === 1 ? t('student.cost.personSingular') : t('student.cost.personPlural')
  } else {
    const mod10 = capacity % 10
    const mod100 = capacity % 100
    const isFew = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
    unit = isFew ? t('student.cost.personFew') : t('student.cost.personMany')
  }
  return t('student.cost.roomLabel', { capacity, unit })
}
function priceRange(min: number, max: number): string {
  const fmt = (n: number) => n.toLocaleString(dateLocaleTag())
  return min === max ? t('student.cost.priceSingle', { amount: fmt(min) }) : t('student.cost.priceRange', { min: fmt(min), max: fmt(max) })
}

onMounted(async () => {
  try {
    hostelInfo.value = await fetchHostelPublicInfo()
  } catch (error) {
    hostelInfoError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isHostelInfoLoading.value = false
  }
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button v-if="!isHome" variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('student.back') }}</span>
      </Button>
      <GraduationCap class="size-5 text-primary" />
      <h1 class="text-lg font-medium">{{ t('student.title') }}</h1>
    </div>

    <Tabs default-value="general">
      <!-- overflow-x-auto — на узком экране 3 подписанных таба (иконка+русский текст)
           могут не поместиться в TabsList (inline-flex, сам не переносится и не сжимается,
           см. components/ui/tabs/TabsList.vue) — без обёртки это раздвигало бы всю
           страницу по горизонтали, так скроллится только сама полоска табов. -->
      <div class="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="general">
            <span class="flex items-center gap-1.5">
              <Building2 class="size-4 text-primary" />
              {{ t('student.tabs.general') }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="payment">
            <span class="flex items-center gap-1.5">
              <Wallet class="size-4 text-primary" />
              {{ t('student.tabs.payment') }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <span class="flex items-center gap-1.5">
              <Contact class="size-4 text-primary" />
              {{ t('student.tabs.contacts') }}
            </span>
          </TabsTrigger>
        </TabsList>
      </div>

      <!-- Вкладка 1 — Здание слева развёрнутым текстом, справа Инфраструктура и под ней
           (по прямой просьбе) Доступность — перенесена сюда с левой колонки, чтобы
           текста в обеих колонках было примерно поровну; "Как добраться" — внизу вкладки. -->
      <TabsContent value="general" class="mt-4 flex flex-col gap-4">
        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col lg:w-1/2 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Building2 class="size-4 text-primary" />
                {{ t('student.building.heading') }}
              </div>
              <p v-for="para in buildingParagraphs" :key="para" class="mt-3 text-sm first:mt-3">{{ para }}</p>
            </div>

            <div class="flex flex-col lg:w-1/2 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Wifi class="size-4 text-primary" />
                {{ t('student.infrastructure.heading') }}
              </div>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                <li v-for="i in infrastructure" :key="i">{{ i }}</li>
              </ul>

              <div class="mt-4 flex items-center gap-1.5 border-t pt-4 text-sm font-medium">
                <Accessibility class="size-4 text-primary" />
                {{ t('student.accessibility.heading') }}
              </div>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                <li>{{ t('student.accessibility.item1') }}</li>
                <li>{{ t('student.accessibility.item2') }}</li>
                <li>{{ t('student.accessibility.item3') }}</li>
                <li>{{ t('student.accessibility.item4') }}</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col lg:w-1/2 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <MapPin class="size-4 text-primary" />
                {{ t('student.directions.heading') }}
              </div>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                <li>{{ t('student.directions.item1') }}</li>
                <li>{{ t('student.directions.item2') }}</li>
                <li>{{ t('student.directions.item3') }}</li>
                <li>{{ t('student.directions.item4') }}</li>
              </ul>
            </div>

            <!-- Тот же embed (конструктор Яндекс.Карт), что и на официальной странице
                 rosnou.ru/university/hostel/ — с готовыми пронумерованными маршрутами на
                 карте, не просто геокодированная точка (см. промпт проекта). -->
            <div class="lg:w-1/2 lg:pl-6">
              <div class="overflow-hidden rounded-md border">
                <iframe
                  src="https://yandex.ru/map-widget/v1/?lang=ru_RU&scroll=true&source=constructor-api&um=constructor%3AzKairv6FkwsqRhkpf5bDqYE06Mx3Xtzy"
                  class="block h-[420px] w-full"
                  loading="lazy"
                  :title="t('student.directions.mapTitle')"
                />
              </div>
            </div>
          </div>
        </Card>
      </TabsContent>

      <!-- Вкладка 2 — Оплата и Стоимость проживания через вертикальный разделитель,
           плюс Временная регистрация и Поликлиники ниже отдельной карточкой. -->
      <TabsContent value="payment" class="mt-4 flex flex-col gap-4">
        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col lg:w-1/2 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Wallet class="size-4 text-primary" />
                {{ t('student.payment.heading') }}
              </div>
              <p class="mt-3 text-sm">
                {{ t('student.payment.paragraph1') }}
              </p>
              <p class="mt-3 text-sm">
                {{ t('student.payment.paragraph2') }}
              </p>
              <p class="mt-3 text-sm">
                {{ t('student.payment.paragraph3') }}
              </p>
            </div>

            <div class="flex flex-col items-center text-center lg:w-1/2 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Banknote class="size-4 text-primary" />
                {{ t('student.cost.heading') }}
              </div>
              <p v-if="hostelInfoError" class="mt-3 text-sm text-red-500">{{ hostelInfoError }}</p>
              <p v-else-if="isHostelInfoLoading" class="mt-3 text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>
              <!-- Разбивка по центру (2026-08-27, по прямой просьбе) — было label слева/
                   цена справа в одну строку, стало карточками label сверху/цена крупно
                   снизу, выровненными по центру колонки, а не растянутыми на всю ширину. -->
              <div v-else class="mt-3 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                <div
                  v-for="p in hostelInfo?.priceRanges ?? []"
                  :key="p.capacity"
                  class="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-3"
                >
                  <span class="text-xs text-muted-foreground">{{ roomLabel(p.capacity) }}</span>
                  <span class="text-base font-semibold">{{ priceRange(p.min, p.max) }}</span>
                </div>
                <div
                  v-if="hostelInfo?.guestRoomDailyRate != null"
                  class="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-3"
                >
                  <span class="text-xs text-muted-foreground">{{ t('student.cost.guestRoom') }}</span>
                  <span class="text-base font-semibold">{{ t('student.cost.perDay', { amount: hostelInfo.guestRoomDailyRate.toLocaleString(dateLocaleTag()) }) }}</span>
                </div>
                <div
                  v-if="hostelInfo?.passRestorationCost != null"
                  class="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-3"
                >
                  <span class="text-xs text-muted-foreground">{{ t('student.cost.passRestoration') }}</span>
                  <span class="text-base font-semibold">{{ t('student.cost.amountRub', { amount: hostelInfo.passRestorationCost.toLocaleString(dateLocaleTag()) }) }}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col lg:w-1/2 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Stethoscope class="size-4 text-primary" />
                {{ t('student.polyclinic.heading') }}
              </div>
              <p class="mt-3 mb-2 text-sm text-muted-foreground">
                {{ t('student.polyclinic.intro') }}
              </p>
              <div class="mb-3 rounded-md border border-dashed p-3">
                <p class="mb-1.5 text-xs font-medium text-muted-foreground">{{ t('student.polyclinic.cheatSheetTitle') }}</p>
                <ol class="flex flex-col gap-1 text-sm">
                  <li v-for="(step, i) in polyclinicSteps" :key="step" class="flex gap-2">
                    <span class="font-medium text-primary">{{ i + 1 }}.</span>
                    <span>{{ step }}</span>
                  </li>
                </ol>
              </div>
              <!-- Раскрывающийся список (по прямой просьбе 2026-08-24) — сам список поликлиник
                   спрятан по умолчанию за тогглом, тот же Collapsible/ChevronRight-паттерн,
                   что у групп сайдбара (см. NavProjects.vue). -->
              <Collapsible v-model:open="polyclinicsOpen">
                <CollapsibleTrigger class="flex w-full items-center gap-1.5 rounded-md py-1 text-sm font-medium hover:text-primary">
                  <ChevronRight class="size-4 shrink-0 transition-transform duration-200" :class="{ 'rotate-90': polyclinicsOpen }" />
                  {{ t('student.polyclinic.listToggle', { count: polyclinics.length }) }}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div class="mt-1 flex flex-col divide-y divide-border pl-5.5">
                    <div v-for="p in polyclinics" :key="p.name" class="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <span class="font-medium">{{ p.name }}</span>
                      <span class="text-muted-foreground">{{ p.address }}<template v-if="p.phone"> · {{ p.phone }}</template></span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div class="flex flex-col lg:w-1/2 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <FileText class="size-4 text-primary" />
                {{ t('student.tempRegistration.heading') }}
              </div>
              <p class="mt-3 mb-2 text-sm text-muted-foreground">
                {{ t('student.tempRegistration.intro') }}
              </p>
              <ul class="flex flex-col gap-1 text-sm">
                <li v-for="d in tempRegistrationDocuments" :key="d">{{ d }}</li>
              </ul>
            </div>
          </div>
        </Card>
      </TabsContent>

      <!-- Вкладка 3 — Контакты, фото крупнее и круглые (лицо+плечи, object-top). -->
      <TabsContent value="contacts" class="mt-4 flex flex-col gap-4">
        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col gap-3 lg:w-2/3 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Contact class="size-4 text-primary" />
                {{ t('student.contactsAdmin.heading') }}
              </div>
              <div class="flex flex-col gap-2">
                <div v-for="c in contacts" :key="c.label" class="flex items-start gap-2 text-sm">
                  <component :is="c.icon" class="size-4 shrink-0 text-primary" />
                  <span class="w-32 shrink-0 text-muted-foreground">{{ c.label }}</span>
                  <!-- min-w-0 + break-words — email/адрес без пробелов иначе не переносится
                       внутри flex-строки и растягивает её (и всю страницу) по горизонтали
                       на узком экране. -->
                  <span class="min-w-0 break-words">{{ c.value }}</span>
                </div>
              </div>
              <div class="mt-1 border-t pt-3">
                <div class="mb-2 text-xs text-muted-foreground">{{ t('student.contactsAdmin.responsibleStaff') }}</div>
                <!-- justify-center — по прямой просьбе: когда фото не помещаются в ряд
                     (например 2 фото на узком экране) и переносятся, неполная строка
                     раньше прижималась к левому краю, теперь центрируется. -->
                <div class="flex flex-wrap justify-center gap-6">
                  <div v-for="p in staff" :key="p.name" class="flex w-40 flex-col items-center gap-2 text-center sm:w-56">
                    <!-- size-40 на мобильном (было размером с половину экрана на узком
                         телефоне), sm:size-56 — прежний размер с планшета и выше. -->
                    <Avatar class="size-40 rounded-full border-4 border-border sm:size-56">
                      <AvatarImage v-if="p.photo" :src="p.photo" :alt="p.name" />
                      <AvatarFallback class="text-4xl">{{ initials(p.name) }}</AvatarFallback>
                    </Avatar>
                    <span class="text-sm leading-tight">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-3 lg:w-1/3 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Users class="size-4 text-primary" />
                {{ t('student.ddmHeading') }}
              </div>
              <div class="flex flex-col gap-2">
                <div v-for="d in ddm" :key="d.label" class="flex items-start gap-2 text-sm">
                  <component :is="d.icon" class="size-4 shrink-0 text-primary" />
                  <span class="w-32 shrink-0 text-muted-foreground">{{ d.label }}</span>
                  <span class="min-w-0 break-words">{{ d.value }}</span>
                </div>
              </div>
              <div class="mt-1 border-t pt-3">
                <div class="mb-2 text-xs text-muted-foreground">{{ t('student.contactsAdmin.responsibleStaff') }}</div>
                <!-- justify-center — по прямой просьбе: когда фото не помещаются в ряд
                     (например 2 фото на узком экране) и переносятся, неполная строка
                     раньше прижималась к левому краю, теперь центрируется. -->
                <div class="flex flex-wrap justify-center gap-6">
                  <div v-for="p in ddmStaff" :key="p.name" class="flex w-40 flex-col items-center gap-2 text-center sm:w-56">
                    <Avatar class="size-40 rounded-full border-4 border-border sm:size-56">
                      <AvatarImage v-if="p.photo" :src="p.photo" :alt="p.name" />
                      <AvatarFallback class="text-4xl">{{ initials(p.name) }}</AvatarFallback>
                    </Avatar>
                    <span class="text-sm leading-tight">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
