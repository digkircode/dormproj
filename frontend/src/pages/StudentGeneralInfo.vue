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
  Banknote,
  Contact,
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
// Три вкладки (2026-08-23, второй раунд) — вместо одной длинной ленты карточек.

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
  { icon: MapPin, label: 'Адрес', value: 'г. Москва, ул. Радио, д. 22, каб. 801' },
  { icon: Phone, label: 'Телефон', value: '+7 (495) 925-03-71 (вн. 211)' },
  { icon: Mail, label: 'Email', value: 'ddm@rosnou.ru, hostel@rosnou.ru' },
  { icon: Clock, label: 'Время работы', value: 'Пн–Пт 10:00–18:00' },
]

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
const buildingParagraphs = [
  'Общая площадь здания — 12 697 м², в общежитии предусмотрено 617 мест для проживания. Комнаты представлены в двух форматах — блочном и коридорном, с разным уровнем комфорта и планировки.',
  'В 2014 году в здании был проведён капитальный ремонт, а для безопасности проживающих установлена система видеонаблюдения.',
  'Здание состоит из двух крыльев, и обустроены они по-разному. На всех этажах правого крыла оборудованы две кухни, три душевые комнаты, четыре холла для отдыха и общения, а также отдельная комната для стирки и сушки белья. В левом крыле — по одной кухне на этаж, а душевые сделаны персональными в каждом блоке, что даёт больше приватности.',
  'В каждой комнате уже установлена необходимая мебель — кровати, шкафы для одежды, тумбочки и холодильник. Утюги, фены и прочую бытовую технику студенты обычно привозят с собой. С разрешения администратора обстановку можно донастроить под себя: поставить дополнительный шкаф, повесить полки или постелить ковёр.',
]

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

// "Шпаргалка" — добавлено 2026-08-23 по присланному пользователем тексту, сжато до
// пошагового списка (само собой разумеющееся вступление про иногородних/список
// документов уже было на странице абзацем выше — не дублировали).
const polyclinicSteps = [
  'Оформить временную регистрацию',
  'Взять с собой полис ОМС, паспорт и СНИЛС',
  'Обратиться в ближайшее отделение страховой компании',
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
        <TabsTrigger value="payment">Оплата и документы</TabsTrigger>
        <TabsTrigger value="contacts">Контакты</TabsTrigger>
      </TabsList>

      <!-- Вкладка 1 — Здание слева развёрнутым текстом, справа Инфраструктура и под ней
           (по прямой просьбе) Доступность — перенесена сюда с левой колонки, чтобы
           текста в обеих колонках было примерно поровну; "Как добраться" — внизу вкладки. -->
      <TabsContent value="general" class="mt-4 flex flex-col gap-4">
        <Card class="p-6">
          <div class="flex flex-col gap-6 lg:flex-row lg:divide-x lg:divide-border">
            <div class="flex flex-col lg:w-1/2 lg:pr-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Building2 class="size-4 text-primary" />
                Здание
              </div>
              <p v-for="para in buildingParagraphs" :key="para" class="mt-3 text-sm first:mt-3">{{ para }}</p>
            </div>

            <div class="flex flex-col lg:w-1/2 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Wifi class="size-4 text-primary" />
                Инфраструктура и услуги
              </div>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                <li v-for="i in infrastructure" :key="i">{{ i }}</li>
              </ul>

              <div class="mt-4 flex items-center gap-1.5 border-t pt-4 text-sm font-medium">
                <Accessibility class="size-4 text-primary" />
                Доступность для лиц с ограниченными возможностями
              </div>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                <li>Общежитие оснащено оборудованием для проживания лиц с ОВЗ и инвалидов</li>
                <li>Пандус для беспрепятственного доступа</li>
                <li>На первом этаже — жилые комнаты, читальный зал, санузлы для лиц с ограниченными возможностями</li>
                <li>Тактильные таблички со шрифтом Брайля</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card class="p-6">
          <div class="flex items-center gap-1.5 text-sm font-medium">
            <MapPin class="size-4 text-primary" />
            Как добраться
          </div>
          <ul class="mt-3 mb-4 flex flex-col gap-1.5 text-sm">
            <li>Ближайшее метро — «Авиамоторная» (около 20 минут пешком)</li>
            <li>От метро «Авиамоторная» — автобус № 695 или с679 до остановки «Андроновское шоссе, 26», далее пешком</li>
            <li>От главного корпуса (ул. Радио, д. 22) — автобус № 624 от остановки «Лефортовская набережная» до «НИИ прикладной механики», далее пешком</li>
            <li>От главного корпуса до метро «Авиамоторная» — трамваи Т2 или 50 от остановки «Лефортовская набережная»</li>
          </ul>
          <!-- Тот же embed (конструктор Яндекс.Карт), что и на официальной странице
               rosnou.ru/university/hostel/ — с готовыми пронумерованными маршрутами на
               карте, не просто геокодированная точка (см. промпт проекта). -->
          <div class="overflow-hidden rounded-md border">
            <iframe
              src="https://yandex.ru/map-widget/v1/?lang=ru_RU&scroll=true&source=constructor-api&um=constructor%3AzKairv6FkwsqRhkpf5bDqYE06Mx3Xtzy"
              class="block h-[420px] w-full"
              loading="lazy"
              title="Как добраться до общежития РосНОУ — карта с маршрутами"
            />
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
                Оплата
              </div>
              <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                <li>Оплата вносится ежемесячно (или сразу за квартал/полугодие) не позднее 5-го числа расчётного месяца — срок зафиксирован в договоре найма</li>
                <li>За каждый день просрочки начисляется пеня — 0,14% от непогашенной суммы в день (п. 4.8/5.9 договора)</li>
                <li>Студенты заочной формы заселяются на время сессии при наличии мест, расчёт — по количеству прожитых дней</li>
              </ul>
            </div>

            <div class="flex flex-col lg:w-1/2 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Banknote class="size-4 text-primary" />
                Стоимость проживания
              </div>
              <p v-if="hostelInfoError" class="mt-3 text-sm text-red-500">{{ hostelInfoError }}</p>
              <p v-else-if="isHostelInfoLoading" class="mt-3 text-sm text-muted-foreground">Загрузка…</p>
              <div v-else class="mt-3 flex flex-col divide-y divide-border">
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
            </div>
          </div>
        </Card>

        <Card class="p-6">
          <div class="flex items-center gap-1.5 text-sm font-medium">
            <FileText class="size-4 text-primary" />
            Временная регистрация
          </div>
          <p class="mt-3 mb-2 text-sm text-muted-foreground">
            Для свидетельства о регистрации по месту пребывания необходимо предоставить (обращение в администрацию
            общежития или каб. 801):
          </p>
          <ul class="flex flex-col gap-1 text-sm">
            <li v-for="d in tempRegistrationDocuments" :key="d">{{ d }}</li>
          </ul>

          <div class="mt-4 flex items-center gap-1.5 border-t pt-4 text-sm font-medium">
            <Stethoscope class="size-4 text-primary" />
            Прикрепление к поликлинике
          </div>
          <p class="mt-3 mb-2 text-sm text-muted-foreground">
            Иногородние студенты могут прикрепиться к ближайшей поликлинике при наличии паспорта, студенческого
            билета, полиса ОМС и временной регистрации.
          </p>
          <div class="mb-3 rounded-md border border-dashed p-3">
            <p class="mb-1.5 text-xs font-medium text-muted-foreground">Шпаргалка: как прикрепиться</p>
            <ol class="flex flex-col gap-1 text-sm">
              <li v-for="(step, i) in polyclinicSteps" :key="step" class="flex gap-2">
                <span class="font-medium text-primary">{{ i + 1 }}.</span>
                <span>{{ step }}</span>
              </li>
            </ol>
          </div>
          <div class="flex flex-col divide-y divide-border">
            <div v-for="p in polyclinics" :key="p.name" class="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
              <span class="font-medium">{{ p.name }}</span>
              <span class="text-muted-foreground">{{ p.address }}<template v-if="p.phone"> · {{ p.phone }}</template></span>
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
                Контакты администрации
              </div>
              <div class="flex flex-col gap-2">
                <div v-for="c in contacts" :key="c.label" class="flex items-start gap-2 text-sm">
                  <component :is="c.icon" class="size-4 shrink-0 text-primary" />
                  <span class="w-32 shrink-0 text-muted-foreground">{{ c.label }}</span>
                  <span>{{ c.value }}</span>
                </div>
              </div>
              <!-- Блок расширен до 2/3 (было 1/2), фото чуть уменьшены (size-56→size-40) —
                   по прямой просьбе, чтобы все 4 фото помещались в один ряд. -->
              <div class="mt-1 border-t pt-3">
                <div class="mb-2 text-xs text-muted-foreground">Ответственные сотрудники</div>
                <div class="flex flex-wrap gap-4">
                  <div v-for="p in staff" :key="p.name" class="flex w-40 flex-col items-center gap-2 text-center">
                    <Avatar class="size-40 rounded-full border-4 border-border">
                      <AvatarImage v-if="p.photo" :src="p.photo" :alt="p.name" />
                      <AvatarFallback class="text-3xl">{{ initials(p.name) }}</AvatarFallback>
                    </Avatar>
                    <span class="text-sm leading-tight">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-3 lg:w-1/3 lg:pl-6">
              <div class="flex items-center gap-1.5 text-sm font-medium">
                <Users class="size-4 text-primary" />
                Департамент по делам молодёжи и воспитательной работе
              </div>
              <div class="flex flex-col gap-2">
                <div v-for="d in ddm" :key="d.label" class="flex items-start gap-2 text-sm">
                  <component :is="d.icon" class="size-4 shrink-0 text-primary" />
                  <span class="w-32 shrink-0 text-muted-foreground">{{ d.label }}</span>
                  <span>{{ d.value }}</span>
                </div>
              </div>
              <div class="mt-1 border-t pt-3">
                <div class="mb-2 text-xs text-muted-foreground">Ответственные сотрудники</div>
                <div class="flex flex-wrap gap-4">
                  <div v-for="p in ddmStaff" :key="p.name" class="flex w-40 flex-col items-center gap-2 text-center">
                    <Avatar class="size-40 rounded-full border-4 border-border">
                      <AvatarImage v-if="p.photo" :src="p.photo" :alt="p.name" />
                      <AvatarFallback class="text-3xl">{{ initials(p.name) }}</AvatarFallback>
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
