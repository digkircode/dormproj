<script setup lang="ts">
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import AppSidebar from './components/AppSidebar.vue'
import StatCard from './components/StatCard.vue'
import AreaChart from './components/AreaChart.vue'
import DataTable from './components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const stats = [
  {
    label: 'Собрано в этом месяце',
    value: '1 250 000 ₽',
    trend: '+12.5%',
    trendUp: true,
    description: 'Рост по сравнению с прошлым месяцем',
    hint: 'За последние 6 месяцев',
  },
  {
    label: 'Должников',
    value: '18',
    trend: '-20%',
    trendUp: false,
    description: 'Меньше, чем в прошлом месяце',
    hint: 'Требует внимания',
  },
  {
    label: 'Заселено комнат',
    value: '312',
    trend: '+2.5%',
    trendUp: true,
    description: 'Стабильная заселённость',
    hint: 'Из 340 доступных',
  },
  {
    label: 'Договоров подписано',
    value: '289',
    trend: '+4.5%',
    trendUp: true,
    description: 'Соответствует плану',
    hint: 'На текущий семестр',
  },
]
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" class="mr-2 h-4" />
        <h1 class="text-sm font-medium">Главная</h1>
      </header>

      <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard v-for="s in stats" :key="s.label" v-bind="s" />
        </div>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between">
            <div>
              <CardTitle class="text-sm">Поступления по месяцам</CardTitle>
              <CardDescription>Динамика оплат за последние 3 месяца</CardDescription>
            </div>
            <Select default-value="3m">
              <SelectTrigger class="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">Последние 3 месяца</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent class="h-56">
            <AreaChart />
          </CardContent>
        </Card>

        <DataTable />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
