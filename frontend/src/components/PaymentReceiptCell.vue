<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ExternalLink } from 'lucide-vue-next'

const { t } = useI18n()

// row — структурно достаточно этих двух полей (не завязано на конкретный тип страницы,
// см. UnifiedPaymentRow в my-payments-api.ts, откуда изначально пришёл компонент) — тот же
// приём, что и у остальных cellRenderer-компонентов проекта (WebsitePaymentStatusPillCell и
// т.п.), чтобы переиспользовать на других страницах (PaymentImports.vue) без цикличного
// импорта чужого типа.
defineProps<{ value: unknown; row: { fiscalReceiptUrl: string | null; showReceiptButton: boolean } }>()
</script>

<template>
  <a
    v-if="row.fiscalReceiptUrl"
    :href="row.fiscalReceiptUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="flex items-center gap-1 text-primary hover:underline"
  >
    {{ t('payment.receipt.open') }}
    <ExternalLink class="size-3.5" />
  </a>
  <!-- Заглушка: реального чека ещё нет (касса не подключена), но кнопка уже на месте —
       по прямой просьбе 2026-08-25 (реальный PDF отдаст сам ОФД/platformaofd.ru после
       подключения, свой макет не делаем). -->
  <button
    v-else-if="row.showReceiptButton"
    type="button"
    class="flex items-center gap-1 text-primary hover:underline"
    :title="t('payment.receipt.stubTitle')"
  >
    {{ t('payment.receipt.open') }}
    <ExternalLink class="size-3.5" />
  </button>
  <span v-else class="text-muted-foreground">—</span>
</template>
