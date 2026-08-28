<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, CreditCard, DoorOpen, FileText, MessageCircle, Phone, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import { fetchMyContract, type MyContractDetail } from '@/lib/contracts-api'
import { residentUnreadCount } from '@/lib/chat-unread-state'
import { currentUser } from '@/lib/auth-state'
import { dateLocaleTag } from '@/lib/format-locale'
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

onMounted(async () => {
  contract.value = await fetchMyContract().catch(() => null)
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
         приветствие по имени + текст + две кнопки слева, маскот с "репликой" справа,
         фон карточки — светло-голубой (как в референсе, не нейтральный bg-card). -->
    <Card class="relative flex flex-col items-start gap-6 overflow-hidden bg-sky-50 p-6 dark:bg-sky-500/10 sm:flex-row sm:items-center sm:justify-between">
      <div class="relative z-10 max-w-lg">
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
        <div class="mt-4 flex flex-wrap gap-3">
          <Button @click="paymentDialog?.open()">
            <CreditCard class="size-4" />
            {{ t('home.resident.payHero') }}
          </Button>
          <!-- Тот же размер/раскладка, что у "Оплатить проживание" выше (Button без
               size — оба default), только свой цвет (outline) не трогаем по прямой
               просьбе — только иконка перекрашена в primary, чтобы кнопка не выглядела
               полностью нейтральной на фоне соседней заполненной. -->
          <Button as-child variant="outline">
            <RouterLink to="/student/contract">
              <FileText class="size-4 text-primary" />
              {{ t('home.resident.myContractButton') }}
            </RouterLink>
          </Button>
        </div>
      </div>

      <div class="relative z-10 flex shrink-0 items-center gap-3">
        <!-- "Реплика" маскота — hidden на самом узком экране (места впритык с текстом+
             кнопками уже не остаётся), с sm: и выше показывается как в референсе. Хвостик
             пузыря — повёрнутый на 45° квадрат с двумя видимыми гранями (border-t/border-r),
             тот же трюк, что для CSS-стрелок без картинок/псевдоэлементов ::after. -->
        <div class="relative hidden max-w-[220px] rounded-2xl border bg-background px-3 py-2 text-sm shadow-sm sm:block">
          {{ t('home.resident.mascotBubble') }}
          <span class="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 border-t border-r bg-background" />
        </div>
        <!-- Облачко позади маскота — по прямой просьбе 2026-08-28, второй заход (первая
             версия не была видна вообще по двум причинам: (1) -z-10 без своего stacking
             context "проваливался" за всю карточку, а не только за маскота — чинит
             class="isolate" ниже, контейнер сам формирует stacking context, -z-10 внутри
             него остаётся строго ЗА img; (2) сам круг (size-28=112px) был МЕНЬШЕ картинки
             (h-32/h-40), т.е. целиком прятался за непрозрачными пикселями PNG, ничего не
             выступало наружу — теперь крупнее картинки (size-64/sm:size-80 против
             h-44/sm:h-60), центрирование через top/left-1/2 + translate вместо inset-0+
             m-auto — последнее у over-constrained (круг больше контейнера) в Chromium даёт
             асимметрию (весь излишек в одну сторону), translate центрирует всегда ровно). -->
        <div class="relative isolate">
          <div
            class="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/90 blur-2xl dark:bg-sky-400/25 sm:size-80"
            aria-hidden="true"
          />
          <img :src="mascotSrc" alt="" class="relative h-44 w-auto sm:h-60" />
        </div>
      </div>
      <CreatePaymentDialog ref="paymentDialog" />
    </Card>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- "Моя комната" — по прямой просьбе 2026-08-28: слева комната/этаж, через
           вертикальную черту справа номер договора/дата создания, "Подробнее" под
           горизонтальной чертой снизу (не 2x2 корпус/этаж/комната/тип, как раньше). -->
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
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
          <!-- mt-auto — карточка стоит в sm:grid-cols-2 рядом с "Оплатой" (см. grid ниже),
               grid по умолчанию тянет оба айтема на равную высоту (align-items: stretch) —
               без mt-auto "Подробнее" оставался бы сразу под контентом, а не у нижнего края
               карточки, если сосед выше (по прямой просьбе 2026-08-28, "черточку и
               подробнее во всех блоках снизу"). -->
          <RouterLink
            to="/student/contract"
            class="mt-auto inline-flex items-center gap-1 border-t pt-3 text-sm text-primary hover:underline"
          >
            {{ t('home.resident.contractLink') }}
            <ArrowRight class="size-3.5" />
          </RouterLink>
        </template>
        <template v-else-if="!isLoading">
          <p class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('home.resident.noContractHint') }}</p>
        </template>
      </Card>

      <!-- "Оплата" (была "Общий баланс") — задолженность в цветной плашке + пилюля
           "Просрочен платёж", следующий платёж, "Перейти к оплате" ссылкой (не кнопкой)
           под чертой, открывает модалку оплаты — всё по прямой просьбе 2026-08-28. -->
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
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
          <!-- mt-auto — тот же приём, что у "Подробнее" в "Моей комнате" выше: держит
               ссылку у нижнего края карточки, растянутой grid'ом до высоты соседа. -->
          <button
            type="button"
            class="mt-auto inline-flex items-center gap-1 border-t pt-3 text-left text-sm text-primary hover:underline"
            @click="paymentDialog?.open()"
          >
            {{ t('home.resident.payAction') }}
            <ArrowRight class="size-3.5" />
          </button>
        </template>
        <p v-else-if="!isLoading" class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
      </Card>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- Чат с сотрудниками — жёлтая иконка, счётчик непрочитанных вместо кружка-точки,
           "Написать сообщение" ссылкой под чертой (тот же паттерн карточки, что выше),
           по прямой просьбе 2026-08-28. -->
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15">
            <MessageCircle class="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          {{ t('home.resident.chatHeading') }}
        </div>
        <p class="text-sm text-muted-foreground">{{ t('home.resident.chatUnreadCount', { count: residentUnreadCount }) }}</p>
        <RouterLink
          to="/student/chat"
          class="mt-auto inline-flex items-center gap-1 border-t pt-3 text-sm text-primary hover:underline"
        >
          {{ t('home.resident.chatCta') }}
          <ArrowRight class="size-3.5" />
        </RouterLink>
      </Card>

      <!-- Контакты — синяя иконка, номера с кнопкой звонка (tel:), по прямой просьбе
           2026-08-28. Номера статические (см. contactGroups в script), нет справочника
           контактов сотрудников в API под резидента. -->
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/15">
            <Phone class="size-4 text-blue-600 dark:text-blue-400" />
          </div>
          {{ t('home.resident.contactsHeading') }}
        </div>
        <div class="flex flex-col gap-3">
          <div v-for="group in contactGroups" :key="group.label" class="flex flex-col gap-1.5">
            <p class="text-xs text-muted-foreground">{{ group.label }}</p>
            <!-- Вся строка — сама ссылка tel: (по прямой просьбе 2026-08-28, "чтобы вся
                 область телефон вводила"), не только маленькая кнопка сбоку — hover-фон на
                 весь ряд даёт понятную кликабельную область. Иконка — primary (тоже по
                 прямой просьбе), не нейтральный/приглушённый цвет по умолчанию. -->
            <a
              v-for="phone in group.phones"
              :key="phone"
              :href="telHref(phone)"
              :aria-label="`${t('home.resident.callAction')}: ${phone}`"
              class="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              <span class="font-medium">{{ phone }}</span>
              <Phone class="size-4 shrink-0 text-primary" />
            </a>
          </div>
        </div>
      </Card>
    </div>
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
