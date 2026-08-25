<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import type { UnifiedPaymentRow } from '@/lib/my-payments-api'

defineProps<{ value: unknown; row: UnifiedPaymentRow }>()
</script>

<template>
  <a
    v-if="row.fiscalReceiptUrl"
    :href="row.fiscalReceiptUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="flex items-center gap-1 text-primary hover:underline"
  >
    Открыть
    <ExternalLink class="size-3.5" />
  </a>
  <!-- Заглушка: реального чека ещё нет (касса не подключена), но кнопка уже на месте —
       по прямой просьбе 2026-08-25 (реальный PDF отдаст сам ОФД/platformaofd.ru после
       подключения, свой макет не делаем). -->
  <button
    v-else-if="row.showReceiptButton"
    type="button"
    class="flex items-center gap-1 text-primary hover:underline"
    title="Заглушка — после подключения кассы здесь будет ссылка на чек от ОФД"
  >
    Открыть
    <ExternalLink class="size-3.5" />
  </button>
  <span v-else class="text-muted-foreground">—</span>
</template>
