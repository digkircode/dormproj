<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, DoorOpen, MessageCircle, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import { fetchMyContract, type MyContractDetail } from '@/lib/contracts-api'
import { hasUnreadResidentChat } from '@/lib/chat-unread-state'
import { currentUser } from '@/lib/auth-state'
import { dateLocaleTag } from '@/lib/format-locale'
// Маскот (енот) — прислан пользователем как PNG 1.5 МБ, пережат в webp 480px/62 КБ через
// sharp (тот же пакет, что уже используется на бэкенде для сжатия фото вложений чата) —
// сырой файл при исходном размере ощутимо утяжелил бы бандл ради картинки 128-160px высотой.
import mascotSrc from '@/assets/enot.webp'

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
// Тот же приём словоформы, что roomLabel() в StudentGeneralInfo.vue (ключи student.cost.*
// уже заведены под это там же, переиспользуем, не дублируем словарь).
function capacityLabel(capacity: number): string {
  const mod10 = capacity % 10
  const mod100 = capacity % 100
  const isFew = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
  const unit = isFew ? t('student.cost.personFew') : t('student.cost.personMany')
  return `${capacity} ${unit}`
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <!-- Шапка сделана буквально по присланному пользователем референсу (2026-08-28):
         приветствие по имени + текст + две кнопки слева, маскот с "репликой" справа. -->
    <Card class="flex flex-col items-start gap-6 overflow-hidden p-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="max-w-lg">
        <h1 class="text-xl font-semibold">
          👋 {{ firstName ? t('home.resident.greetingTitle', { name: firstName }) : t('home.resident.greetingTitleFallback') }}
        </h1>
        <p class="mt-3 text-sm text-muted-foreground">{{ t('home.resident.greetingBody1') }}</p>
        <p class="mt-3 text-sm text-muted-foreground">{{ t('home.resident.greetingBody2') }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button size="sm" @click="paymentDialog?.open()">{{ t('home.resident.payHero') }}</Button>
          <Button as-child variant="outline" size="sm">
            <RouterLink to="/student/contract">{{ t('home.resident.myContractButton') }}</RouterLink>
          </Button>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-3">
        <!-- "Реплика" маскота — hidden на самом узком экране (места впритык с текстом+
             кнопками уже не остаётся), с sm: и выше показывается как в референсе. Хвостик
             пузыря — повёрнутый на 45° квадрат с двумя видимыми гранями (border-t/border-r),
             тот же трюк, что для CSS-стрелок без картинок/псевдоэлементов ::after. -->
        <div class="relative hidden max-w-[200px] rounded-2xl border bg-background px-3 py-2 text-xs shadow-sm sm:block">
          {{ t('home.resident.mascotBubble') }}
          <span class="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 border-t border-r bg-background" />
        </div>
        <img :src="mascotSrc" alt="" class="h-32 w-auto sm:h-40" />
      </div>
      <CreatePaymentDialog ref="paymentDialog" />
    </Card>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- "Моя комната" — по референсу от пользователя (2026-08-28): Корпус/Этаж и
           Комната/Тип комнаты парами в сетке 2x2, "Подробнее" ссылкой снизу. Корпус/Этаж/
           Тип комнаты (вместимость) — характеристики комнаты (EAV), не поля самой Room,
           могут быть не заведены на конкретную комнату (null) — тогда просто "—". -->
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <DoorOpen class="size-4 text-primary" />
          {{ t('home.resident.roomHeading') }}
        </div>
        <template v-if="!isLoading && contract?.currentRoom">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs text-muted-foreground">{{ t('home.resident.corpusLabel') }}</p>
              <p class="font-medium">{{ contract.currentRoom.corpus ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t('home.resident.floorLabel') }}</p>
              <p class="font-medium">
                {{ contract.currentRoom.floor != null ? t('home.resident.floorValue', { floor: contract.currentRoom.floor }) : '—' }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t('home.resident.roomNumberLabel') }}</p>
              <p class="font-medium">{{ contract.currentRoom.room }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t('home.resident.roomTypeLabel') }}</p>
              <p class="font-medium">{{ contract.currentRoom.capacity != null ? capacityLabel(contract.currentRoom.capacity) : '—' }}</p>
            </div>
          </div>
          <RouterLink to="/student/contract" class="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {{ t('home.resident.contractLink') }}
            <ArrowRight class="size-3.5" />
          </RouterLink>
        </template>
        <template v-else-if="!isLoading">
          <p class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('home.resident.noContractHint') }}</p>
        </template>
      </Card>

      <!-- "Оплата" — задолженность (как раньше) + следующий платёж (по прямой просьбе
           2026-08-28: первое начисление с непогашенным остатком, то же самое, в каком
           порядке единственно и можно платить, см. allocatePaymentFifo/промпт проекта) —
           дата/сумма подсвечены красным, если срок уже прошёл. -->
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <Wallet class="size-4 text-primary" />
          {{ t('contracts.detail.totalBalance') }}
        </div>
        <template v-if="!isLoading && contract">
          <p class="text-2xl font-semibold" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
            {{ formatMoney(totalBalance) }}
          </p>
          <div class="border-t pt-3">
            <p class="text-xs text-muted-foreground">{{ t('home.resident.nextPaymentHeading') }}</p>
            <div v-if="nextAccrual" class="mt-1 flex items-center justify-between gap-2 text-sm">
              <span :class="isNextPaymentOverdue ? 'font-medium text-red-500' : ''">
                {{ t('home.resident.nextPaymentDue', { date: formatDate(nextAccrual.dueDate) }) }}
                <template v-if="isNextPaymentOverdue">— {{ t('home.resident.overdue') }}</template>
              </span>
              <span class="font-medium" :class="isNextPaymentOverdue ? 'text-red-500' : ''">{{ formatMoney(nextAccrual.balance) }}</span>
            </div>
            <p v-else class="mt-1 text-sm text-muted-foreground">{{ t('home.resident.noOpenAccruals') }}</p>
          </div>
          <Button as-child size="sm" class="w-fit">
            <RouterLink to="/student/contract">{{ t('home.resident.payAction') }}</RouterLink>
          </Button>
        </template>
        <p v-else-if="!isLoading" class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
      </Card>
    </div>

    <Card class="flex flex-wrap items-center justify-between gap-3 p-4">
      <div class="flex items-center gap-2 text-sm font-medium">
        <MessageCircle class="size-4 text-primary" />
        {{ t('home.resident.chatHeading') }}
        <span v-if="hasUnreadResidentChat" class="size-2 shrink-0 rounded-full bg-primary" />
      </div>
      <Button as-child variant="outline" size="sm">
        <RouterLink to="/student/chat">{{ t('home.resident.chatCta') }}</RouterLink>
      </Button>
    </Card>
  </div>
</template>
