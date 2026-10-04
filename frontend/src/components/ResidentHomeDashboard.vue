<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, CreditCard, DoorOpen, Megaphone, Newspaper, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import AnnouncementReadDialog from '@/components/AnnouncementReadDialog.vue'
import AllAnnouncementsDialog from '@/components/AllAnnouncementsDialog.vue'
import ResidentNotificationsCard from '@/components/ResidentNotificationsCard.vue'
import { fetchMyContractHomeSummary, type MyContractHomeSummary } from '@/lib/contracts-api'
import { fetchMyAnnouncements, type ResidentAnnouncement } from '@/lib/announcements-api'
import { currentUser } from '@/lib/auth-state'
import { dateLocaleTag } from '@/lib/format-locale'
import { iconBadgeColorClasses } from '@/lib/avatar-color'
// Маскот — сгенерирован пользователем отдельно под референс (2026-08-28, вторая версия —
// первая была фото енота без позы "как на референсе"), пережат через sharp (456×365,
// ~22 КБ, альфа-канал сохранён) тем же приёмом, что и первая версия.
import mascotSrc from '@/assets/mascot.webp'

const { t } = useI18n()

// demo — только для временной страницы-демки DemoStudentHome.vue (см. промпт проекта,
// "показать интерфейс проживающего покупателю без переключения ролей на аккаунте
// сотрудника"): подсовывает уже готовые данные вместо похода в GET /my-contract/summary
// (у демонстрационного STAFF/ADMIN-аккаунта обычно нет привязанного резидента, реальный
// запрос просто вернул бы null/403). В обычном режиме (RESIDENT, настоящая "Главная")
// пропсы не передаются — поведение компонента не меняется вообще.
const props = defineProps<{
  demo?: boolean
  demoContract?: MyContractHomeSummary | null
  demoAnnouncements?: ResidentAnnouncement[]
}>()

// Главная для чистого RESIDENT (см. Home.vue) — только реальные данные, без "Обращений"/
// "Объявлений" из присланного пользователем референса: в приложении нет ни таблиц под них
// в БД, ни эндпоинтов (только чат с сотрудниками) — по прямой просьбе 2026-08-28 такую
// функциональность в макете не изображаем как настоящую. Комната/оплата — сводка через
// свой собственный лёгкий эндпоинт (GET /my-contract/summary, добавлено 2026-09-04) —
// раньше эта страница дёргала fetchMyContract() целиком (все начисления/платежи/пеня-лог/
// terms, нужные "Договору/Платежам", MyContract.vue), хотя показывает только пару чисел.
const contract = ref<MyContractHomeSummary | null>(null)
type LoadState = 'loading' | 'success' | 'error'
const contractState = ref<LoadState>('loading')
const announcementsState = ref<LoadState>('loading')
const paymentDialog = ref<InstanceType<typeof CreatePaymentDialog> | null>(null)
// Имя (не полное ФИО) — тот же rosnou-id аккаунт, что и у сотрудников, поле name отдельно
// от surname/patronymic (см. SessionUser в auth-api.ts), фолбэк на случай пустого значения
// (теоретически возможно, если у аккаунта в rosnou-id имя не заполнено).
const firstName = computed(() => currentUser.value?.name || null)

// Объявления — по прямой просьбе 2026-08-30, без markdown/HTML (текст рендерится как есть
// через {{ }}, не через v-html — см. обсуждение в промпте про XSS-инвариант проекта).
// Видны ВСЕМ с ролью RESIDENT без таргетинга (см. MyAnnouncementsController на бэке).
const announcements = ref<ResidentAnnouncement[]>([])
const ANNOUNCEMENTS_PREVIEW_COUNT = 2
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

onMounted(() => {
  if (props.demo) {
    contract.value = props.demoContract ?? null
    announcements.value = props.demoAnnouncements ?? []
    contractState.value = 'success'
    announcementsState.value = 'success'
    return
  }
  void fetchMyContractHomeSummary().then((value) => {
    contract.value = value
    contractState.value = 'success'
  }).catch(() => { contractState.value = 'error' })
  void fetchMyAnnouncements().then((value) => {
    announcements.value = value
    announcementsState.value = 'success'
  }).catch(() => { announcementsState.value = 'error' })
})

// totalBalance/nextAccrual уже посчитаны на бэке (GET /my-contract/summary, FIFO-порядок
// начислений — тот же принцип, что и allocatePaymentFifo, см. промпт проекта) — тут только
// разворачиваем null-контракт в 0/null для шаблона.
const totalBalance = computed(() => contract.value?.totalBalance ?? 0)
const nextAccrual = computed(() => contract.value?.nextAccrual ?? null)
const isNextPaymentOverdue = computed(() => !!nextAccrual.value && new Date(nextAccrual.value.dueDate).getTime() < Date.now())

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag())
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <Card class="relative flex flex-col items-start gap-6 overflow-hidden px-5 pt-6 sm:px-10 lg:flex-row lg:items-center lg:gap-8 lg:px-[80px]">
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

      <div class="relative z-10 w-full max-w-xl min-w-0">
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

      <div class="relative z-10 flex shrink-0 items-center gap-1 lg:ml-auto">
        <div class="relative hidden max-w-[220px] rounded-2xl border bg-background px-3 py-2 text-base shadow-sm lg:block">
          {{ t('home.resident.mascotBubble') }}
          <span class="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 border-t border-r bg-background" />
        </div>
        <div class="relative h-[218px] -translate-x-2 overflow-hidden sm:h-[326px] sm:-translate-x-3">
          <img :src="mascotSrc" alt="" class="h-[241px] w-auto sm:h-[363px]" />
        </div>
      </div>
      <CreatePaymentDialog ref="paymentDialog" />
    </Card>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- "Моя комната" — по прямой просьбе 2026-08-28: слева комната/этаж, через
           вертикальную черту справа номер договора/дата создания, "Подробнее" под
           горизонтальной чертой снизу (не 2x2 корпус/этаж/комната/тип, как раньше). -->
      <Card class="flex flex-col gap-3 rounded-2xl border-0 p-4">
        <div class="flex items-start gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/20">
            <DoorOpen class="size-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold leading-5">{{ t('home.resident.roomHeading') }}</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.roomTagline') }}</p>
          </div>
        </div>
        <div v-if="contractState === 'loading'" class="space-y-3" aria-hidden="true"><div v-for="n in 3" :key="n" class="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="contractState === 'error'" class="text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <template v-else-if="contract?.currentRoom">
          <div class="flex divide-x text-sm">
            <div class="flex flex-1 flex-col gap-3 pr-4">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.roomNumberLabel') }}</p>
                <p class="font-medium">{{ contract.currentRoom.room }}</p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.floorLabel') }}</p>
                <p class="font-medium">
                  {{ contract.currentRoom.floor != null ? t('home.resident.floorValue', { floor: contract.currentRoom.floor }) : '-' }}
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
        <template v-else>
          <p class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('home.resident.noContractHint') }}</p>
        </template>
      </Card>

      <!-- "Оплата" (была "Общий баланс") — задолженность в цветной плашке + пилюля
           "Просрочен платёж", следующий платёж, "Перейти к оплате" ссылкой (не кнопкой)
           под чертой, открывает модалку оплаты — всё по прямой просьбе 2026-08-28. -->
      <Card class="flex flex-col gap-3 rounded-2xl border-0 p-4">
        <div class="flex items-start gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-500/20">
            <Wallet class="size-4 text-green-600 dark:text-green-400" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold leading-5">{{ t('home.resident.paymentHeading') }}</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.paymentTagline') }}</p>
          </div>
        </div>
        <div v-if="contractState === 'loading'" class="space-y-3" aria-hidden="true"><div v-for="n in 3" :key="n" class="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="contractState === 'error'" class="text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <template v-else-if="contract">
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
        <p v-else class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
      </Card>
    </div>

    <!-- Уведомления занимают место карточки чата; на узком экране карточки идут друг под другом. -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
      <!-- Объявления — по прямой просьбе 2026-08-30, фиолетовая иконка (в отличие от
           остальных карточек, у каждой свой фиксированный цвет — sky/green/amber/blue выше),
           показывает последние ANNOUNCEMENTS_PREVIEW_COUNT штук, полный список — в модалке
           "Все объявления" ниже (та же кнопка-ссылка под чертой, что и у остальных карточек). -->
      <Card class="flex flex-col gap-3 rounded-2xl border-0 p-4">
        <div class="flex items-start gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/20">
            <Megaphone class="size-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold leading-5">{{ t('home.resident.announcementsHeading') }}</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.announcementsTagline') }}</p>
          </div>
        </div>
        <div v-if="announcementsState === 'loading'" class="space-y-3" aria-hidden="true"><div v-for="n in 2" :key="n" class="h-16 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="announcementsState === 'error'" class="text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else-if="!announcements.length" class="text-sm text-muted-foreground">{{ t('home.resident.announcementsEmpty') }}</p>
        <!-- Раньше — hover:bg-accent на голом ряду + divide-y между рядами. По прямой
             просьбе 2026-08-30 — каждый ряд теперь "невзрачный" блок с постоянным приглушённым
             фоном (не разделительные линии), gap между блоками вместо divide-y, hover — синим
             (не нейтральным accent, как у остальных карточек — акцент специально другой).
             items-center (не items-start) — дата+точка справа (см. ниже) центрируются по
             всей высоте ряда, а не только по заголовку, по прямой просьбе того же дня. -->
        <div v-else class="flex flex-col gap-2">
          <button
            v-for="a in announcementsPreview"
            :key="a.id"
            type="button"
            class="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-blue-50 dark:bg-muted/20 dark:hover:bg-blue-500/10"
            @click="announcementReadDialog?.open(a)"
          >
            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="iconBadgeColorClasses(a.id).container">
              <Newspaper class="size-4" :class="iconBadgeColorClasses(a.id).icon" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ a.title }}</p>
              <p class="truncate text-sm text-muted-foreground">{{ a.body }}</p>
            </div>
            <!-- Дата слева от точки (не над/под ней — по прямой просьбе), вся группа
                 центрирована по высоте ряда через items-center на родителе выше. Точка не
                 исчезает после прочтения (было v-if="a.unread") — становится серой
                 (text-muted-foreground/40), а не пропадает, чтобы место оставалось стабильным
                 и был виден сам факт "уже открывали". -->
            <div class="flex shrink-0 items-center gap-1.5">
              <span class="text-xs text-muted-foreground">{{ formatDate(a.createdAt) }}</span>
              <span class="size-2 shrink-0 rounded-full" :class="a.unread ? 'bg-blue-500' : 'bg-muted-foreground/40'" />
            </div>
          </button>
        </div>
        <div v-if="announcementsState === 'success'" class="mt-auto border-t pt-3">
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

      <ResidentNotificationsCard :demo="props.demo" />
    </div>

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
