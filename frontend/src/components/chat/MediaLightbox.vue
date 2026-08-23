<script setup lang="ts">
import { computed, watch } from 'vue'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { chatAttachmentUrl, type ChatAttachment } from '@/lib/chat-api'

// Простой самодельный лайтбокс (без сторонней библиотеки) — открывается поверх Dialog
// (z-[60] против z-50 у components/ui/dialog), Teleport в body, чтобы не зависеть от
// overflow/positioning родителя (сообщение внутри проскролливаемой ленты чата).
const props = defineProps<{
  open: boolean
  attachments: ChatAttachment[]
  index: number
  attachmentBasePath: string
}>()

const emit = defineEmits<{ 'update:open': [boolean]; 'update:index': [number] }>()

const current = computed(() => props.attachments[props.index])
const url = computed(() => (current.value ? chatAttachmentUrl(props.attachmentBasePath, current.value.id) : ''))
const hasPrev = computed(() => props.index > 0)
const hasNext = computed(() => props.index < props.attachments.length - 1)

function close() {
  emit('update:open', false)
}
function prev() {
  if (hasPrev.value) emit('update:index', props.index - 1)
}
function next() {
  if (hasNext.value) emit('update:index', props.index + 1)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowLeft') prev()
  else if (event.key === 'ArrowRight') next()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open && current" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" @click.self="close">
        <button type="button" class="absolute top-4 right-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white" @click="close">
          <X class="size-6" />
          <span class="sr-only">Закрыть</span>
        </button>
        <button
          v-if="hasPrev"
          type="button"
          class="absolute top-1/2 left-4 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          @click.stop="prev"
        >
          <ChevronLeft class="size-8" />
          <span class="sr-only">Предыдущий файл</span>
        </button>
        <button
          v-if="hasNext"
          type="button"
          class="absolute top-1/2 right-4 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          @click.stop="next"
        >
          <ChevronRight class="size-8" />
          <span class="sr-only">Следующий файл</span>
        </button>
        <img
          v-if="current.kind === 'IMAGE'"
          :src="url"
          :alt="current.fileName"
          class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          @click.stop
        />
        <video v-else :src="url" controls autoplay class="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" @click.stop />
      </div>
    </Transition>
  </Teleport>
</template>
