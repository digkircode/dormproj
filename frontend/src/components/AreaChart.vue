<script setup lang="ts">
const points = [20, 35, 25, 45, 30, 55, 40, 60, 45, 70, 50, 65, 55, 75, 60, 80, 65, 85, 70, 90]

const width = 1000
const height = 260
const step = width / (points.length - 1)

const linePath = points
  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - (p / 100) * height}`)
  .join(' ')

const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="h-full w-full">
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.35" />
        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" fill="url(#areaFill)" />
    <path :d="linePath" fill="none" stroke="var(--primary)" stroke-width="2" />
  </svg>
</template>
