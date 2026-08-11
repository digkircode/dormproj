<script setup lang="ts">
import { TrendingUp, TrendingDown } from 'lucide-vue-next'
import { Card, CardHeader, CardDescription, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

defineProps<{
  label: string
  value: string
  trend: string
  trendUp: boolean
  description: string
  hint: string
}>()
</script>

<template>
  <Card class="gap-4">
    <CardHeader>
      <div class="flex items-start justify-between">
        <div>
          <CardDescription>{{ label }}</CardDescription>
          <CardTitle class="mt-1 text-2xl font-semibold tabular-nums">{{ value }}</CardTitle>
        </div>
        <Badge variant="outline" class="gap-1">
          <component :is="trendUp ? TrendingUp : TrendingDown" class="size-3" />
          {{ trend }}
        </Badge>
      </div>
    </CardHeader>
    <CardFooter class="flex-col items-start gap-1 text-sm">
      <p class="flex items-center gap-1 font-medium">
        {{ description }}
        <component :is="trendUp ? TrendingUp : TrendingDown" class="size-3.5" />
      </p>
      <p class="text-muted-foreground">{{ hint }}</p>
    </CardFooter>
  </Card>
</template>
