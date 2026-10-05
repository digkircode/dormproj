<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

withDefaults(defineProps<{ columns: number; rows?: number; toolbar?: boolean; bordered?: boolean }>(), {
  rows: 6,
  toolbar: false,
  bordered: true,
})

const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-col gap-4" role="status" :aria-label="t('entityTable.loading')">
    <div v-if="toolbar" class="flex items-center justify-between gap-4" aria-hidden="true">
      <Skeleton class="h-10 w-full max-w-80" />
      <div class="flex gap-2"><Skeleton class="size-10" /><Skeleton class="size-10" /></div>
    </div>
    <div class="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg" :class="{ border: bordered }">
      <Table class="table-fixed">
        <TableHeader class="bg-muted">
          <TableRow aria-hidden="true">
            <TableHead v-for="column in columns" :key="column"><Skeleton class="h-4 w-3/4" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in rows" :key="row" aria-hidden="true">
            <TableCell v-for="column in columns" :key="column"><Skeleton class="h-4 w-3/4" /></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <span class="sr-only">{{ t('entityTable.loading') }}</span>
  </div>
</template>
