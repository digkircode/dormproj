<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, DoorOpen, MessageCircle, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchMyContract, type MyContractDetail } from '@/lib/contracts-api'
import { hasUnreadResidentChat } from '@/lib/chat-unread-state'
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

onMounted(async () => {
  contract.value = await fetchMyContract().catch(() => null)
  isLoading.value = false
})

const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance : 0,
)

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <Card class="flex flex-col items-center gap-4 overflow-hidden p-6 text-center sm:flex-row sm:items-center sm:text-left">
      <div class="flex-1">
        <h1 class="text-xl font-semibold">🏠 {{ t('home.resident.greetingTitle') }}</h1>
        <p class="mt-2 text-sm text-muted-foreground">{{ t('home.resident.greetingBody') }}</p>
      </div>
      <img :src="mascotSrc" alt="" class="h-32 w-auto shrink-0 sm:h-40" />
    </Card>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <DoorOpen class="size-4 text-primary" />
          {{ t('home.resident.roomHeading') }}
        </div>
        <template v-if="!isLoading && contract?.currentRoom">
          <p class="text-2xl font-semibold">{{ contract.currentRoom.room }}</p>
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

      <Card class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <Wallet class="size-4 text-primary" />
          {{ t('contracts.detail.totalBalance') }}
        </div>
        <template v-if="!isLoading && contract">
          <p class="text-2xl font-semibold" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
            {{ formatMoney(totalBalance) }}
          </p>
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
