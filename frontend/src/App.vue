<script setup lang="ts">
import { ref, onMounted } from 'vue'

const message = ref('Loading...')

onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3000/')
    message.value = await res.text()
  } catch {
    message.value = 'Backend not reachable'
  }
})
</script>

<template>
  <h1>{{ message }}</h1>
</template>
