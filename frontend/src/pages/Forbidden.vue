<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ShieldOff } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center md:p-6">
    <ShieldOff class="size-10 text-muted-foreground" />
    <h1 class="text-lg font-medium">{{ t('forbidden.title') }}</h1>
    <p class="max-w-sm text-sm text-muted-foreground">
      {{ t('forbidden.description') }}
    </p>
    <Button variant="outline" @click="router.push({ name: 'home' })">{{ t('forbidden.goHome') }}</Button>
  </div>
</template>
