<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StatCard from '@/components/StatCard.vue'
import AreaChart from '@/components/AreaChart.vue'
import DataTable from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const { t } = useI18n()

// Захардкоженные моки (см. DormProjPrompt.md — Home.vue не подключена к бэкенду),
// поэтому value/trend/hint-числа остаются литералами, переводятся только подписи.
const stats = computed(() => [
  {
    label: t('home.statCollectedThisMonth'),
    value: '1 250 000 ₽',
    trend: '+12.5%',
    trendUp: true,
    description: t('home.statCollectedTrendDesc'),
    hint: t('home.statCollectedHint'),
  },
  {
    label: t('home.statDebtors'),
    value: '18',
    trend: '-20%',
    trendUp: false,
    description: t('home.statDebtorsDesc'),
    hint: t('home.statDebtorsHint'),
  },
  {
    label: t('home.statOccupied'),
    value: '312',
    trend: '+2.5%',
    trendUp: true,
    description: t('home.statOccupiedDesc'),
    hint: t('home.statOccupiedHint'),
  },
  {
    label: t('home.statContracts'),
    value: '289',
    trend: '+4.5%',
    trendUp: true,
    description: t('home.statContractsDesc'),
    hint: t('home.statContractsHint'),
  },
])
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard v-for="s in stats" :key="s.label" v-bind="s" />
    </div>

    <Card>
      <CardHeader class="flex flex-row items-center justify-between">
        <div>
          <CardTitle class="text-sm">{{ t('home.chartTitle') }}</CardTitle>
          <CardDescription>{{ t('home.chartDescription') }}</CardDescription>
        </div>
        <Select default-value="3m">
          <SelectTrigger class="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">{{ t('home.chartRangeLast3Months') }}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent class="h-56">
        <AreaChart />
      </CardContent>
    </Card>

    <DataTable />
  </div>
</template>
