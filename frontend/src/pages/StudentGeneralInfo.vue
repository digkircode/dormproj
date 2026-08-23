<script setup lang="ts">
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
  ClipboardList,
  IdCard,
  FileText,
  Stethoscope,
  BookOpen,
  GraduationCap,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// Контент дословно взят со страницы https://rosnou.ru/university/hostel/ (по прямой
// просьбе — эта страница показывает официальную информацию об общежитии как есть, без
// отсебятины). Обновлять вручную при изменениях на сайте вуза — автосинхронизации нет.

const contacts = [
  { icon: MapPin, label: 'Адрес', value: 'г. Москва, ул. Авиамоторная, д. 55, корп. 5' },
  { icon: Phone, label: 'Телефон', value: '+7 (977) 812-81-87, +7 (495) 223-40-49' },
  { icon: Mail, label: 'Email', value: 'hostel@rosnou.ru' },
  { icon: Clock, label: 'Время работы', value: '9:30–18:00' },
]

const staff = [
  'Молоствова Наталья Константиновна',
  'Цицерова Марина Викторовна',
  'Жилякова Татьяна Анатольевна',
  'Исаева Наталья Анатольевна',
]

const ddm = [
  { label: 'Адрес', value: 'г. Москва, ул. Радио, д. 22, каб. 801' },
  { label: 'Телефон', value: '+7 (495) 925-03-71 (вн. 211)' },
  { label: 'Email', value: 'ddm@rosnou.ru, hostel@rosnou.ru' },
  { label: 'Время работы', value: 'Пн–Пт 10:00–18:00' },
]

const infrastructure = [
  'Бесплатный Wi-Fi на всей территории общежития',
  'Общая кухня на каждом этаже',
  'Прачечная и сушильная комната — стирка 80 ₽, сушка 80 ₽',
  'Столовая: Пн–Чт 10:00–19:00, Пт 10:00–18:00, Сб–Вс — выходной',
  'Спортивный зал',
  'Читальный зал и библиотека, доступ к компьютерам',
]

const pricing = [
  { room: 'Комната на 2 человека', price: '8 500–13 500 ₽/мес.' },
  { room: 'Комната на 3 человека', price: '7 000–9 000 ₽/мес. за место' },
  { room: 'Комната на 4 человека', price: '6 000–8 000 ₽/мес. за место' },
  { room: 'Комната на 5 человек', price: '6 500 ₽/мес. за место' },
  { room: 'Гостевая комната', price: '1 000 ₽/сутки за человека' },
  { room: 'Восстановление студенческого билета', price: '200 ₽' },
  { room: 'Восстановление пластиковой карты', price: '400 ₽' },
]

const moveInSteps = [
  'Подать заявление на предоставление места в общежитии РосНОУ',
  'После публикации приказа о зачислении в течение 5 рабочих дней уточнить категорию предоставленной комнаты',
  'Произвести оплату за проживание',
  'Направить копии квитанции об оплате, паспорта (страницы 2, 3, 4, 5), СНИЛС, ИНН студента и одного из родителей',
  'Перед заселением проверить на сайте rosnou.ru наличие фамилии студента в списке заселённых',
]

const moveInDocuments = ['Паспорт', 'Фотография 3×4 (1 шт.)', 'Квитанция об оплате']

const priorities = [
  'Поступившие на 1 курс по квоте на программы бакалавриата и специалитета',
  'Поступившие на 1 курс на бюджетные места на программы бакалавриата и специалитета',
  'Поступившие на 1 курс в колледж',
  'Поступившие на 1 курс на платные места на программы бакалавриата и специалитета',
  'Поступившие на 1 курс на программы магистратуры',
  'Студенты других курсов университета (с ноября, при наличии свободных мест)',
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

const documents = [
  'Правила внутреннего распорядка в студенческом общежитии',
  'Приказ об установлении размера платы за пользование',
  'Договор найма жилого помещения',
  'Договор найма жилого помещения для несовершеннолетних',
  'Информация о стоимости восстановления пропуска',
]
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
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card class="p-6">
            <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
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
            <div class="mt-3 border-t pt-3">
              <div class="mb-1.5 text-xs text-muted-foreground">Ответственные сотрудники</div>
              <ul class="flex flex-col gap-1 text-sm">
                <li v-for="s in staff" :key="s">{{ s }}</li>
              </ul>
            </div>
          </Card>

          <Card class="p-6">
            <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
              <Users class="size-4 text-primary" />
              Департамент по делам молодёжи и воспитательной работе
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="d in ddm" :key="d.label" class="flex items-start gap-2 text-sm">
                <span class="w-32 shrink-0 text-muted-foreground">{{ d.label }}</span>
                <span>{{ d.value }}</span>
              </div>
            </div>
          </Card>
        </div>

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
          <div class="flex flex-col divide-y divide-border">
            <div v-for="p in pricing" :key="p.room" class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
              <span class="text-muted-foreground">{{ p.room }}</span>
              <span class="font-medium">{{ p.price }}</span>
            </div>
          </div>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <ClipboardList class="size-4 text-primary" />
            Порядок заселения
          </div>
          <ol class="flex flex-col gap-2 text-sm">
            <li v-for="(step, i) in moveInSteps" :key="step" class="flex gap-2">
              <span class="font-medium text-primary">{{ i + 1 }}.</span>
              <span>{{ step }}</span>
            </li>
          </ol>
          <div class="mt-3 border-t pt-3">
            <div class="mb-1.5 text-xs text-muted-foreground">При заселении необходимо иметь</div>
            <ul class="flex flex-col gap-1 text-sm">
              <li v-for="d in moveInDocuments" :key="d">{{ d }}</li>
            </ul>
          </div>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <GraduationCap class="size-4 text-primary" />
            Приоритеты при заселении
          </div>
          <ol class="flex flex-col gap-1.5 text-sm">
            <li v-for="(p, i) in priorities" :key="p" class="flex gap-2">
              <span class="font-medium text-primary">{{ i + 1 }}.</span>
              <span>{{ p }}</span>
            </li>
          </ol>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Wallet class="size-4 text-primary" />
            Оплата
          </div>
          <ul class="flex flex-col gap-1.5 text-sm">
            <li>Оплата производится ежемесячно, поквартально, за год или полугодие</li>
            <li>До 20 сентября — оплата за следующий месяц (квартал/полугодие), в кассе университета или в банке по реквизитам</li>
            <li>Студенты заочной формы заселяются на время сессии при наличии мест, расчёт — по количеству прожитых дней</li>
            <li>Онлайн-оплата без комиссии — dst.rosnou.ru</li>
          </ul>
        </Card>

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <IdCard class="size-4 text-primary" />
            Пропуск
          </div>
          <ul class="flex flex-col gap-1.5 text-sm">
            <li>Студентам РосНОУ при заключении договора найма доступ по студенческому билету открывается автоматически</li>
            <li>Остальным проживающим выдаётся пластиковый пропуск после заключения договора</li>
            <li>Восстановление студенческого билета — 200 ₽, пластиковой карты — 400 ₽, срок выдачи — 3 рабочих дня</li>
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

        <Card class="p-6">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <BookOpen class="size-4 text-primary" />
            Документы
          </div>
          <ul class="flex flex-col gap-1 text-sm">
            <li v-for="d in documents" :key="d">{{ d }}</li>
          </ul>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
