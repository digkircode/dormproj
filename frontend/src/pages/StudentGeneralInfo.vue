<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
  FileText,
  Stethoscope,
  GraduationCap,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { fetchHostelPublicInfo, type HostelPublicInfo } from '@/lib/public-info-api'
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

interface StaffPerson {
  name: string
  photo?: string
}

const contacts = [
  { icon: MapPin, label: 'Адрес', value: 'г. Москва, ул. Авиамоторная, д. 55, корп. 5' },
  { icon: Phone, label: 'Телефон', value: '+7 (977) 812-81-87, +7 (495) 223-40-49' },
  { icon: Mail, label: 'Email', value: 'hostel@rosnou.ru' },
  { icon: Clock, label: 'Время работы', value: '9:30–18:00' },
]

// photo — файлы получены от пользователя 2026-08-23 с говорящими именами (mol/cic/jil/isa/
// guz/but — по фамилии), сопоставление подтверждено, не гадали по внешности.
const staff: StaffPerson[] = [
  { name: 'Молоствова Наталья Константиновна', photo: molPhoto },
  { name: 'Цицерова Марина Викторовна', photo: cicPhoto },
  { name: 'Жилякова Татьяна Анатольевна', photo: jilPhoto },
  { name: 'Исаева Наталья Анатольевна', photo: isaPhoto },
]

const ddm = [
  { label: 'Адрес', value: 'г. Москва, ул. Радио, д. 22, каб. 801' },
  { label: 'Телефон', value: '+7 (495) 925-03-71 (вн. 211)' },
  { label: 'Email', value: 'ddm@rosnou.ru, hostel@rosnou.ru' },
  { label: 'Время работы', value: 'Пн–Пт 10:00–18:00' },
]

const ddmStaff: StaffPerson[] = [
  { name: 'Гузенко Виктория Владимировна', photo: guzPhoto },
  { name: 'Буторова Наталья Владимировна', photo: butPhoto },
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

const infrastructure = [
  'Бесплатный Wi-Fi на всей территории общежития',
  'Общая кухня на каждом этаже',
  'Прачечная и сушильная комната — стирка 80 ₽, сушка 80 ₽',
  'Столовая: Пн–Чт 10:00–19:00, Пт 10:00–18:00, Сб–Вс — выходной',
  'Спортивный зал',
  'Читальный зал и библиотека, доступ к компьютерам',
]

const tempRegistrationDocuments = [
  'Ксерокопия страниц паспорта (2, 3, 4, 5)',
  'Выписка из приказа о зачислении',
  'Справка с места обучения',
  'Фотография 3×4 см',
]

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
function roomLabel(capacity: number): string {
  const mod10 = capacity % 10
  const mod100 = capacity % 100
  const isFew = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
  return `Комната на ${capacity} ${isFew ? 'человека' : 'человек'}`
}
function priceRange(min: number, max: number): string {
  const fmt = (n: number) => n.toLocaleString('ru-RU')
  return min === max ? `${fmt(min)} ₽/мес.` : `${fmt(min)}–${fmt(max)} ₽/мес.`
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
      <GraduationCap class="size-5 text-primary" />
      <h1 class="text-lg font-medium">Общежитие РосНОУ</h1>
    </div>

    <Tabs default-value="general">
      <TabsList>
        <TabsTrigger value="general">Общая информация</TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="mt-4 flex flex-col gap-4">
        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Building2 class="size-4 text-primary" />
            Здание
          </div>
          <ul class="flex flex-col gap-1.5 text-sm">
            <li>Общая площадь здания — 12 697 м², всего 617 мест для проживания</li>
            <li>Блочный и коридорный типы комнат с разным уровнем комфорта</li>
            <li>В 2014 году проведён капитальный ремонт</li>
            <li>Установлена система видеонаблюдения</li>
          </ul>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Wifi class="size-4 text-primary" />
            Инфраструктура и услуги
          </div>
          <ul class="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            <li v-for="i in infrastructure" :key="i">{{ i }}</li>
          </ul>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Accessibility class="size-4 text-primary" />
            Доступность для лиц с ограниченными возможностями
          </div>
          <ul class="flex flex-col gap-1.5 text-sm">
            <li>Общежитие оснащено оборудованием для проживания лиц с ОВЗ и инвалидов</li>
            <li>Пандус для беспрепятственного доступа</li>
            <li>На первом этаже — жилые комнаты, читальный зал, санузлы для лиц с ограниченными возможностями</li>
            <li>Тактильные таблички со шрифтом Брайля</li>
          </ul>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Wallet class="size-4 text-primary" />
            Стоимость проживания
          </div>
          <p v-if="hostelInfoError" class="text-sm text-red-500">{{ hostelInfoError }}</p>
          <p v-else-if="isHostelInfoLoading" class="text-sm text-muted-foreground">Загрузка…</p>
          <div v-else class="flex flex-col divide-y divide-border">
            <div
              v-for="p in hostelInfo?.priceRanges ?? []"
              :key="p.capacity"
              class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0"
            >
              <span class="text-muted-foreground">{{ roomLabel(p.capacity) }}</span>
              <span class="font-medium">{{ priceRange(p.min, p.max) }}</span>
            </div>
            <div
              v-if="hostelInfo?.guestRoomDailyRate != null"
              class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0"
            >
              <span class="text-muted-foreground">Гостевая комната</span>
              <span class="font-medium">{{ hostelInfo.guestRoomDailyRate.toLocaleString('ru-RU') }} ₽/сутки</span>
            </div>
            <div
              v-if="hostelInfo?.passRestorationCost != null"
              class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0"
            >
              <span class="text-muted-foreground">Восстановление пропускного документа</span>
              <span class="font-medium">{{ hostelInfo.passRestorationCost.toLocaleString('ru-RU') }} ₽</span>
            </div>
          </div>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Wallet class="size-4 text-primary" />
            Оплата
          </div>
          <ul class="flex flex-col gap-1.5 text-sm">
            <li>Оплата вносится ежемесячно (или сразу за квартал/полугодие) не позднее 5-го числа расчётного месяца — срок зафиксирован в договоре найма</li>
            <li>За каждый день просрочки начисляется пеня — 0,14% от непогашенной суммы в день (п. 4.8/5.9 договора)</li>
            <li>Студенты заочной формы заселяются на время сессии при наличии мест, расчёт — по количеству прожитых дней</li>
          </ul>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <FileText class="size-4 text-primary" />
            Временная регистрация
          </div>
          <p class="mb-2 text-sm text-muted-foreground">
            Для свидетельства о регистрации по месту пребывания необходимо предоставить (обращение в администрацию
            общежития или каб. 801):
          </p>
          <ul class="flex flex-col gap-1 text-sm">
            <li v-for="d in tempRegistrationDocuments" :key="d">{{ d }}</li>
          </ul>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Stethoscope class="size-4 text-primary" />
            Прикрепление к поликлинике
          </div>
          <p class="mb-2 text-sm text-muted-foreground">
            Иногородние студенты могут прикрепиться к ближайшей поликлинике при наличии паспорта, студенческого
            билета, полиса ОМС и временной регистрации.
          </p>
          <div class="flex flex-col divide-y divide-border">
            <div v-for="p in polyclinics" :key="p.name" class="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
              <span class="font-medium">{{ p.name }}</span>
              <span class="text-muted-foreground">{{ p.address }}<template v-if="p.phone"> · {{ p.phone }}</template></span>
            </div>
          </div>
        </Card>

        <!-- Контакты — по прямой просьбе в самом низу страницы, объединены в одну карточку
             (администрация общежития + ДДМ) вместо двух отдельных рядом. -->
        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col gap-3 lg:w-1/2 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Phone class="size-4 text-primary" />
                Контакты администрации
              </div>
              <div class="flex flex-col gap-2">
                <div v-for="c in contacts" :key="c.label" class="flex items-start gap-2 text-sm">
                  <component :is="c.icon" class="size-4 shrink-0 text-primary" />
                  <span class="w-32 shrink-0 text-muted-foreground">{{ c.label }}</span>
                  <span>{{ c.value }}</span>
                </div>
              </div>
              <div class="mt-1 border-t pt-3">
                <div class="mb-2 text-xs text-muted-foreground">Ответственные сотрудники</div>
                <div class="flex flex-wrap gap-4">
                  <div v-for="p in staff" :key="p.name" class="flex w-20 flex-col items-center gap-1.5 text-center">
                    <Avatar class="size-16 rounded-md border-2 border-border">
                      <AvatarImage v-if="p.photo" :src="p.photo" :alt="p.name" />
                      <AvatarFallback class="rounded-md text-sm">{{ initials(p.name) }}</AvatarFallback>
                    </Avatar>
                    <span class="text-xs leading-tight">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-3 lg:w-1/2 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Users class="size-4 text-primary" />
                Департамент по делам молодёжи и воспитательной работе
              </div>
              <div class="flex flex-col gap-2">
                <div v-for="d in ddm" :key="d.label" class="flex items-start gap-2 text-sm">
                  <span class="w-32 shrink-0 text-muted-foreground">{{ d.label }}</span>
                  <span>{{ d.value }}</span>
                </div>
              </div>
              <div class="mt-1 border-t pt-3">
                <div class="mb-2 text-xs text-muted-foreground">Ответственные сотрудники</div>
                <div class="flex flex-wrap gap-4">
                  <div v-for="p in ddmStaff" :key="p.name" class="flex w-20 flex-col items-center gap-1.5 text-center">
                    <Avatar class="size-16 rounded-md border-2 border-border">
                      <AvatarImage v-if="p.photo" :src="p.photo" :alt="p.name" />
                      <AvatarFallback class="rounded-md text-sm">{{ initials(p.name) }}</AvatarFallback>
                    </Avatar>
                    <span class="text-xs leading-tight">{{ p.name }}</span>
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
