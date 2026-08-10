<script setup lang="ts">
import { ref, onMounted } from 'vue'

const message = ref('Loading...')

onMounted(async () => {
  try {
    const backendUrl = `${window.location.protocol}//${window.location.hostname}:3000/`
    const res = await fetch(backendUrl)
    message.value = await res.text()
  } catch {
    message.value = 'Backend not reachable'
  }
})
</script>

<template>
  <h1>{{ message }}</h1>
</template>
