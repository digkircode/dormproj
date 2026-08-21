<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ShieldOff } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const router = useRouter()
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center md:p-6">
    <ShieldOff class="size-10 text-muted-foreground" />
    <h1 class="text-lg font-medium">Доступ запрещён</h1>
    <p class="max-w-sm text-sm text-muted-foreground">
      У вашей роли нет доступа к этому разделу. Если это ошибка — обратитесь к администратору.
    </p>
    <Button variant="outline" @click="router.push({ name: 'home' })">На главную</Button>
  </div>
</template>
