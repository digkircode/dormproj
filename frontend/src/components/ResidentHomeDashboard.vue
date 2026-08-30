<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, CreditCard, DoorOpen, MessageCircle, Newspaper, Phone, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import AnnouncementReadDialog from '@/components/AnnouncementReadDialog.vue'
import AllAnnouncementsDialog from '@/components/AllAnnouncementsDialog.vue'
import { fetchMyContract, type MyContractDetail } from '@/lib/contracts-api'
import { fetchMyAnnouncements, type ResidentAnnouncement } from '@/lib/announcements-api'
import { residentUnreadCount } from '@/lib/chat-unread-state'
import { currentUser } from '@/lib/auth-state'
import { dateLocaleTag } from '@/lib/format-locale'
import { iconBadgeColorClasses } from '@/lib/avatar-color'
// Маскот — сгенерирован пользователем отдельно под референс (2026-08-28, вторая версия —
// первая была фото енота без позы "как на референсе"), пережат через sharp (456×365,
// ~22 КБ, альфа-канал сохранён) тем же приёмом, что и первая версия.
import mascotSrc from '@/assets/mascot.webp'

const { t } = useI18n()

// Главная для чистого RESIDENT (см. Home.vue) — только реальные данные, без "Обращений"/
// "Объявлений" из присланного пользователем референса: в приложении нет ни таблиц под них
// в БД, ни эндпоинтов (только чат с сотрудниками) — по прямой просьбе 2026-08-28 такую
// функциональность в макете не изображаем как настоящую. Комната/оплата — те же данные,
// что уже показывает MyContract.vue (GET /my-contract), эта страница просто их же
// суммирует в двух плашках + ссылки на реальные разделы.
const contract = ref<MyContractDetail | null>(null)
const isLoading = ref(true)
const paymentDialog = ref<InstanceType<typeof CreatePaymentDialog> | null>(null)
// Имя (не полное ФИО) — тот же rosnou-id аккаунт, что и у сотрудников, поле name отдельно
// от surname/patronymic (см. SessionUser в auth-api.ts), фолбэк на случай пустого значения
// (теоретически возможно, если у аккаунта в rosnou-id имя не заполнено).
const firstName = computed(() => currentUser.value?.name || null)

// Объявления — по прямой просьбе 2026-08-30, без markdown/HTML (текст рендерится как есть
// через {{ }}, не через v-html — см. обсуждение в промпте про XSS-инвариант проекта).
// Видны ВСЕМ с ролью RESIDENT без таргетинга (см. MyAnnouncementsController на бэке).
const announcements = ref<ResidentAnnouncement[]>([])
const ANNOUNCEMENTS_PREVIEW_COUNT = 3
const announcementsPreview = computed(() => announcements.value.slice(0, ANNOUNCEMENTS_PREVIEW_COUNT))
const announcementReadDialog = ref<InstanceType<typeof AnnouncementReadDialog> | null>(null)
const allAnnouncementsDialog = ref<InstanceType<typeof AllAnnouncementsDialog> | null>(null)

// Общий обработчик для обеих модалок (карточка-превью и "Все объявления") — один и тот же
// массив announcements лежит в основе обеих, поэтому достаточно найти запись по id и снять
// unread — реактивность Vue подхватывает мутацию вложенного объекта сама (тот же принцип,
// что и у residentUnreadCount/чата), отдельный рефетч всего списка не нужен.
function markAnnouncementAsRead(id: number) {
  const found = announcements.value.find((a) => a.id === id)
  if (found) found.unread = false
}

onMounted(async () => {
  const [contractResult, announcementsResult] = await Promise.all([
    fetchMyContract().catch(() => null),
    fetchMyAnnouncements().catch(() => []),
  ])
  contract.value = contractResult
  announcements.value = announcementsResult
  isLoading.value = false
})

const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance : 0,
)

// Начисления уже приходят отсортированными по periodStart (см. GET /my-contract) — первое
// с непогашенным остатком и есть "следующий платёж" (та же логика, что и FIFO-разноска
// allocatePaymentFifo на бэке — платить можно только по порядку, см. промпт проекта).
const nextAccrual = computed(() => contract.value?.accruals.find((a) => a.balance > 0) ?? null)
const isNextPaymentOverdue = computed(() => !!nextAccrual.value && new Date(nextAccrual.value.dueDate).getTime() < Date.now())

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag())
}
// Контакты общежития — по прямой просьбе 2026-08-28, статические номера (не из API —
// в проекте нет справочника контактов сотрудников для резидентов). Только label
// переведён (i18n), сами номера одинаковы в любой локали.
const contactGroups = computed(() => [
  { label: t('home.resident.contactsDutyAdmin'), phones: ['+7 (977) 812-81-87', '+7 (495) 223-40-49'] },
  { label: t('home.resident.contactsYouthDept'), phones: ['+7 (495) 925-03-71'] },
])
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <!-- Шапка сделана буквально по присланному пользователем референсу (2026-08-28):
         приветствие по имени + текст + кнопка слева, маскот с "репликой" справа.
         Фон — по прямой просьбе 2026-08-29 приведён к тому же bg-card, что у остальных
         карточек ниже (раньше был отдельный светло-голубой оттенок). px-[72px] (72px, было
         px-16=64px — 72 не попадает в стандартную шкалу Tailwind, отсюда произвольное
         значение вместо именованного класса), pt-6 (24px, вернули по прямой просьбе —
         первая версия убрала верхний отступ вместе с нижним), без нижнего паддинга (было
         p-6=24px со всех сторон). -->
    <Card class="relative flex flex-col items-start gap-6 overflow-hidden px-[72px] pt-6 sm:flex-row sm:items-center sm:gap-8">
      <!-- "Облачка" — девятый заход 2026-08-28, по прямой просьбе отказались от попытки
           воспроизвести точный силуэт — просто россыпь кружков разного размера по всей
           шапке (не только в углу), тот же самый мягкий цвет (bg-sky-100/dark:bg-sky-400/15),
           без blur, как и раньше. Позиции/размеры вперемешку (top/bottom/left/right,
           4–14% ширины) — намеренно нерегулярно, "красиво", не по сетке. -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="absolute top-[8%] left-[6%] aspect-square w-[6%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[38%] left-[16%] aspect-square w-[4%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[10%] left-[28%] aspect-square w-[8%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[14%] left-[38%] aspect-square w-[5%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[30%] left-[46%] aspect-square w-[10%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[4%] right-[38%] aspect-square w-[7%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[6%] right-[30%] aspect-square w-[13%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[22%] right-[24%] aspect-square w-[6%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -bottom-[4%] right-[18%] aspect-square w-[16%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[2%] right-[14%] aspect-square w-[9%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[42%] right-[10%] aspect-square w-[5%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -right-[4%] bottom-[16%] aspect-square w-[14%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -right-[3%] -bottom-[6%] aspect-square w-[18%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -top-[3%] -right-[2%] aspect-square w-[11%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[46%] -right-[2%] aspect-square w-[7%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
      </div>

      <!-- justify-between → gap-8 на самой Card (по прямой просьбе 2026-08-28: расстояние
           между приветственным текстом и маскотом/облачком было слишком большим на широких
           экранах — justify-between растягивал его на весь остаток ширины). -->
      <div class="relative z-10 max-w-xl">
        <h1 class="text-2xl font-semibold">
          <!-- Явный эмодзи-шрифт первым в стеке (не общий 'Inter Variable'/sans-serif сайта) —
               форсирует настоящую цветную отрисовку системным цветным эмодзи-шрифтом вместо
               чёрно-белого "текстового" глифа с обводкой, который иначе может подставить
               браузер, если для этого символа в основном шрифте страницы нет цветного
               покрытия (по прямой просьбе 2026-08-28, уже второй заход — VS16 сам по себе
               не помог, см. class="font-emoji" ниже). -->
          <span class="font-emoji">👋</span>
          {{ firstName ? t('home.resident.greetingTitle', { name: firstName }) : t('home.resident.greetingTitleFallback') }}
        </h1>
        <p class="mt-3 text-base text-muted-foreground">{{ t('home.resident.greetingBody1') }}</p>
        <p class="mt-3 text-base text-muted-foreground">{{ t('home.resident.greetingBody2') }}</p>
        <!-- Кнопка "Мой договор" убрана из шапки по прямой просьбе 2026-08-29 — тот же
             переход теперь доступен через заголовок карточки "Моя комната" ниже
             (переименована в "Мой договор", см. roomHeading). Осталась одна кнопка,
             flex-1/min-w-0 больше не нужны — делить пространство больше не с кем. -->
        <div class="mt-4">
          <Button @click="paymentDialog?.open()">
            <CreditCard class="size-4" />
            {{ t('home.resident.payHero') }}
          </Button>
        </div>
      </div>

      <!-- sm:ml-auto — маскот прижат к правому краю шапки (по прямой просьбе 2026-08-28):
           без него на широкой карточке (текст ýже max-w-xl, а карточка ещё шире) маскот
           просто шёл сразу за текстом через gap-8, оставляя пустоту СПРАВА от него до края
           карточки, а не наоборот. ml-auto съедает именно эту пустоту, подтягивая маскот к
           краю; gap-8 остаётся минимальным отступом от текста, когда свободного места нет. -->
      <!-- gap-1 (было gap-3) — по прямой просьбе 2026-08-29 маскот подвинут ближе к
           пузырю с текстом. -->
      <div class="relative z-10 flex shrink-0 items-center gap-1 sm:ml-auto">
        <!-- "Реплика" маскота — hidden на самом узком экране (места впритык с текстом+
             кнопками уже не остаётся), с sm: и выше показывается как в референсе. Хвостик
             пузыря — повёрнутый на 45° квадрат с двумя видимыми гранями (border-t/border-r),
             тот же трюк, что для CSS-стрелок без картинок/псевдоэлементов ::after.
             text-base (было text-sm) — по прямой просьбе 2026-08-29. -->
        <div class="relative hidden max-w-[220px] rounded-2xl border bg-background px-3 py-2 text-base shadow-sm sm:block">
          {{ t('home.resident.mascotBubble') }}
          <span class="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 border-t border-r bg-background" />
        </div>
        <!-- "Выглядывает" из шапки — по прямой просьбе 2026-08-29. mascot.webp сам обрезан
             впритык по прозрачным краям (см. историю правок), поэтому "обрезать по ступни"
             сделано НЕ перекраиванием файла (тогда лапы исчезли бы совсем), а обёрткой
             с overflow-hidden короче самой картинки: img выше своего контейнера — блочный
             элемент по умолчанию прижат к верху бокса, поэтому лишнее уходит вниз за пределы
             контейнера и обрезается именно там. Разница высот подобрана по факту разметки
             самой картинки (сверил направляющими линиями через sharp/composite на разных %
             высоты) так, чтобы обрезка проходила ровно по ступням, не задевая голени —
             ~10%, не произвольные "покрупнее". Видимая высота (h-64/sm:h-96) не поменялась.
             -translate-x — сдвиг чуть левее (по просьбе), transform не занимает места в
             layout, на соседа (пузырь) не влияет. -->
        <div class="relative h-64 -translate-x-2 overflow-hidden sm:h-96 sm:-translate-x-3">
          <img :src="mascotSrc" alt="" class="h-[284px] w-auto sm:h-[427px]" />
        </div>
      </div>
      <CreatePaymentDialog ref="paymentDialog" />
    </Card>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- "Моя комната" — по прямой просьбе 2026-08-28: слева комната/этаж, через
           вертикальную черту справа номер договора/дата создания, "Подробнее" под
           горизонтальной чертой снизу (не 2x2 корпус/этаж/комната/тип, как раньше). -->
      <Card class="flex flex-col gap-3 p-6">
        <div class="flex items-center gap-1.5 text-base font-medium">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15">
            <DoorOpen class="size-4 text-sky-600 dark:text-sky-400" />
          </div>
          {{ t('home.resident.roomHeading') }}
        </div>
        <template v-if="!isLoading && contract?.currentRoom">
          <div class="flex divide-x text-sm">
            <div class="flex flex-1 flex-col gap-3 pr-4">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.roomNumberLabel') }}</p>
                <p class="font-medium">{{ contract.currentRoom.room }}</p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.floorLabel') }}</p>
                <p class="font-medium">
                  {{ contract.currentRoom.floor != null ? t('home.resident.floorValue', { floor: contract.currentRoom.floor }) : '—' }}
                </p>
              </div>
            </div>
            <div class="flex flex-1 flex-col gap-3 pl-4">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.contractNumberLabel') }}</p>
                <p class="font-medium">{{ contract.number }}</p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.contractCreatedLabel') }}</p>
                <p class="font-medium">{{ formatDate(contract.createdAt) }}</p>
              </div>
            </div>
          </div>
          <!-- mt-auto на ОБЁРТКЕ (не на самой ссылке) — карточка стоит в sm:grid-cols-2
               рядом с "Оплатой" (см. grid ниже), grid тянет оба айтема на равную высоту
               (align-items: stretch), без mt-auto блок остался бы сразу под контентом, а
               не у нижнего края более высокой карточки-соседа. Черта (border-t) — на этой
               же обёртке, поэтому тянется на всю ширину карточки (обёртка — обычный div,
               растягивается по умолчанию) — а кликабельна только сама ссылка внутри неё,
               по размеру своего текста (inline-flex, ужимается по контенту сам по себе, раз
               уж он не прямой flex-child растягивающегося контейнера) — оба требования
               2026-08-28 (третий заход: "черточка на всю ширину" + "кликабельны только
               надписи") больше не противоречат друг другу. -->
          <div class="mt-auto border-t pt-3">
            <RouterLink to="/student/contract" class="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              {{ t('home.resident.contractLink') }}
              <ArrowRight class="size-3.5" />
            </RouterLink>
          </div>
        </template>
        <template v-else-if="!isLoading">
          <p class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('home.resident.noContractHint') }}</p>
        </template>
      </Card>

      <!-- "Оплата" (была "Общий баланс") — задолженность в цветной плашке + пилюля
           "Просрочен платёж", следующий платёж, "Перейти к оплате" ссылкой (не кнопкой)
           под чертой, открывает модалку оплаты — всё по прямой просьбе 2026-08-28. -->
      <Card class="flex flex-col gap-3 p-6">
        <div class="flex items-center gap-1.5 text-base font-medium">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-500/15">
            <Wallet class="size-4 text-green-600 dark:text-green-400" />
          </div>
          {{ t('home.resident.paymentHeading') }}
        </div>
        <template v-if="!isLoading && contract">
          <div
            class="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
            :class="totalBalance > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-green-50 dark:bg-green-500/10'"
          >
            <div>
              <p class="text-xs text-muted-foreground">{{ t('home.resident.debtLabel') }}</p>
              <p class="text-xl font-semibold" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
                {{ formatMoney(totalBalance) }}
              </p>
            </div>
            <!-- Нейтральная пилюля вместо сплошной красной заливки (по прямой просьбе
                 2026-08-28, "слишком явно выделен") — тот же паттерн, что у статусов в
                 ContractRegistryStatusCell.vue: тонкая обводка + приглушённый фон, акцент
                 только в цвете текста, не в заливке. -->
            <span
              v-if="isNextPaymentOverdue"
              class="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
            >
              {{ t('home.resident.overdue') }}
            </span>
          </div>
          <!-- Черта между долгом и следующим платежом убрана по прямой просьбе 2026-08-28 —
               просто gap-3 родительской Card, без border-t. -->
          <div>
            <p class="text-xs text-muted-foreground">{{ t('home.resident.nextPaymentHeading') }}</p>
            <div v-if="nextAccrual" class="mt-1 flex items-center justify-between gap-2 text-sm">
              <span :class="isNextPaymentOverdue ? 'font-medium text-red-500' : ''">
                {{ t('home.resident.nextPaymentDue', { date: formatDate(nextAccrual.dueDate) }) }}
              </span>
              <span class="font-medium" :class="isNextPaymentOverdue ? 'text-red-500' : ''">{{ formatMoney(nextAccrual.balance) }}</span>
            </div>
            <p v-else class="mt-1 text-sm text-muted-foreground">{{ t('home.resident.noOpenAccruals') }}</p>
          </div>
          <!-- mt-auto + черта на обёртке, кликабельна только кнопка внутри — тот же приём,
               что у "Подробнее" в "Моей комнате" выше (см. комментарий там). -->
          <div class="mt-auto border-t pt-3">
            <button
              type="button"
              class="inline-flex items-center gap-1 text-left text-sm text-primary hover:underline"
              @click="paymentDialog?.open()"
            >
              {{ t('home.resident.payAction') }}
              <ArrowRight class="size-3.5" />
            </button>
          </div>
        </template>
        <p v-else-if="!isLoading" class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
      </Card>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- Чат с сотрудниками — жёлтая иконка, счётчик непрочитанных вместо кружка-точки,
           "Написать сообщение" ссылкой под чертой (тот же паттерн карточки, что выше),
           по прямой просьбе 2026-08-28. -->
      <Card class="flex flex-col gap-3 p-6">
        <div class="flex items-center gap-1.5 text-base font-medium">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15">
            <MessageCircle class="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          {{ t('home.resident.chatHeading') }}
        </div>
        <p class="text-sm text-muted-foreground">{{ t('home.resident.chatUnreadCount', { count: residentUnreadCount }) }}</p>
        <!-- mt-auto + черта на обёртке, кликабельна только ссылка внутри — тот же приём,
             что у "Подробнее" в "Моей комнате" выше (см. комментарий там). -->
        <div class="mt-auto border-t pt-3">
          <RouterLink to="/student/chat" class="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {{ t('home.resident.chatCta') }}
            <ArrowRight class="size-3.5" />
          </RouterLink>
        </div>
      </Card>

      <!-- Контакты — синяя иконка, номера с кнопкой звонка (tel:), по прямой просьбе
           2026-08-28. Номера статические (см. contactGroups в script), нет справочника
           контактов сотрудников в API под резидента. -->
      <Card class="flex flex-col gap-3 p-6">
        <div class="flex items-center gap-1.5 text-base font-medium">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/15">
            <Phone class="size-4 text-blue-600 dark:text-blue-400" />
          </div>
          {{ t('home.resident.contactsHeading') }}
        </div>
        <div class="flex flex-col gap-3">
          <div v-for="group in contactGroups" :key="group.label" class="flex flex-col gap-1.5">
            <p class="text-xs text-muted-foreground">{{ group.label }}</p>
            <!-- Кликабельна только сама иконка-кнопка справа (не вся строка — по прямой
                 просьбе 2026-08-28, второй заход: первая версия делала кликабельным весь
                 ряд, оказалось не то, что нужно). Номер — обычный текст, не ссылка.
                 :class вместо <Button as-child> — тот же обход бага, что у "Мой договор"
                 в шапке (см. комментарий там): as-child+Primitive/Slot накидывает merged-
                 классы на промежуточный <span class="contents"> от Button.vue, а не на
                 сам <a>, тут это неважно (внутри только одна иконка, переносить нечему),
                 но раз уж есть готовый безопасный паттерн — используем его и здесь. -->
            <div v-for="phone in group.phones" :key="phone" class="flex items-center justify-between gap-2 text-sm">
              <span class="font-medium">{{ phone }}</span>
              <a
                :href="telHref(phone)"
                :aria-label="`${t('home.resident.callAction')}: ${phone}`"
                :class="buttonVariants({ variant: 'outline', size: 'icon-sm' })"
              >
                <Phone class="size-4 text-primary" />
              </a>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Объявления — по прямой просьбе 2026-08-30, фиолетовая иконка (в отличие от
         остальных карточек, у каждой свой фиксированный цвет — sky/green/amber/blue выше),
         показывает последние ANNOUNCEMENTS_PREVIEW_COUNT штук, полный список — в модалке
         "Все объявления" ниже (та же кнопка-ссылка под чертой, что и у остальных карточек). -->
    <Card class="flex flex-col gap-3 p-6">
      <div class="flex items-center gap-1.5 text-base font-medium">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/15">
          <Newspaper class="size-4 text-violet-600 dark:text-violet-400" />
        </div>
        {{ t('home.resident.announcementsHeading') }}
      </div>
      <p v-if="!isLoading && !announcements.length" class="text-sm text-muted-foreground">{{ t('home.resident.announcementsEmpty') }}</p>
      <!-- Раньше — hover:bg-accent на голом ряду + divide-y между рядами. По прямой
           просьбе 2026-08-30 — каждый ряд теперь "невзрачный" блок с постоянным приглушённым
           фоном (не разделительные линии), gap между блоками вместо divide-y, hover — синим
           (не нейтральным accent, как у остальных карточек — акцент специально другой). -->
      <div v-else class="flex flex-col gap-2">
        <button
          v-for="a in announcementsPreview"
          :key="a.id"
          type="button"
          class="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-blue-50 dark:bg-muted/20 dark:hover:bg-blue-500/10"
          @click="announcementReadDialog?.open(a)"
        >
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="iconBadgeColorClasses(a.id).container">
            <Newspaper class="size-4" :class="iconBadgeColorClasses(a.id).icon" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold">{{ a.title }}</p>
            <p class="truncate text-sm text-muted-foreground">{{ a.body }}</p>
          </div>
          <span v-if="a.unread" class="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
        </button>
      </div>
      <div class="mt-auto border-t pt-3">
        <button
          type="button"
          class="inline-flex items-center gap-1 text-left text-sm text-primary hover:underline"
          @click="allAnnouncementsDialog?.open()"
        >
          {{ t('home.resident.announcementsSeeAll') }}
          <ArrowRight class="size-3.5" />
        </button>
      </div>
    </Card>

    <AnnouncementReadDialog ref="announcementReadDialog" @read="markAnnouncementAsRead" />
    <AllAnnouncementsDialog ref="allAnnouncementsDialog" :announcements="announcements" @read="markAnnouncementAsRead" />
  </div>
</template>

<style scoped>
/* Явный эмодзи-шрифт первым в стеке — глобальный font-sans сайта ('Inter Variable',
   sans-serif) не покрывает эмодзи-кодпоинты сам, и на некоторых системах браузер выбирает
   для generic-фолбэка sans-serif чёрно-белый символьный шрифт (с обводкой) вместо цветного
   эмодзи-шрифта ОС — VS16 в разметке (был первой попыткой чуть раньше) на такой системе не
   помогает, т.к. проблема не в presentation-селекторе, а в том, какой шрифт вообще выбран.
   Явное перечисление реальных цветных эмодзи-шрифтов ОС/браузеров форсирует нужный. */
.font-emoji {
  font-family:
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Noto Color Emoji',
    sans-serif;
}
</style>
