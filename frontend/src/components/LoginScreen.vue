<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { rosnouLoginUrl } from '@/lib/auth-api'
</script>

<template>
  <div class="flex min-h-svh items-center justify-center p-4">
    <Card class="w-full max-w-sm">
      <CardHeader class="text-center">
        <CardTitle class="text-xl">RosNOU · Общежитие</CardTitle>
        <CardDescription>Вход только для сотрудников</CardDescription>
      </CardHeader>
      <CardContent>
        <Button as-child class="w-full">
          <a :href="rosnouLoginUrl()">Войти через RosNOU ID</a>
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
