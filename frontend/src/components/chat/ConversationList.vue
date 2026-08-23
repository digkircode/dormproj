<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessageSquarePlus, Search } from 'lucide-vue-next'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { avatarColorClasses, initials } from '@/lib/avatar-color'
import type { ChatConversationListItem } from '@/lib/chat-api'

const props = defineProps<{
  conversations: ChatConversationListItem[]
  selectedId: number | null
}>()

const emit = defineEmits<{ select: [id: number]; 'new-message': [] }>()

const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.conversations
  return props.conversations.filter((c) => c.fullName.toLowerCase().includes(q))
})

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
</script>

<template>
  <div class="flex min-h-0 w-80 shrink-0 flex-col border-r">
    <div class="flex items-center gap-2 border-b p-3">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="query" placeholder="Поиск диалогов..." class="pl-9" />
      </div>
      <Button variant="outline" size="icon" title="Написать проживающим" @click="emit('new-message')">
        <MessageSquarePlus class="size-4" />
        <span class="sr-only">Написать проживающим</span>
      </Button>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <p v-if="filtered.length === 0" class="p-4 text-center text-sm text-muted-foreground">Диалогов не найдено</p>
      <TransitionGroup name="conversation-row" tag="div">
        <button
          v-for="conversation in filtered"
          :key="conversation.id"
          type="button"
          class="flex w-full items-start gap-3 border-b p-3 text-left transition-colors hover:bg-muted"
          :class="conversation.id === selectedId ? 'bg-muted' : ''"
          @click="emit('select', conversation.id)"
        >
          <Avatar size="sm" :class="avatarColorClasses(conversation.fullName)">
            <AvatarFallback :class="avatarColorClasses(conversation.fullName)">{{ initials(conversation.fullName) }}</AvatarFallback>
          </Avatar>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm" :class="conversation.unread ? 'font-semibold' : 'font-medium'">{{ conversation.fullName }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ formatTime(conversation.lastMessageAt) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span
                class="truncate text-xs"
                :class="conversation.unread ? 'font-medium text-foreground' : 'text-muted-foreground'"
              >{{ conversation.lastMessage ?? 'Нет сообщений' }}</span>
              <span v-if="conversation.unread" class="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
            </div>
          </div>
        </button>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
/* Диалог, поднявшийся наверх списка после нового сообщения (см. Chats.vue —
   рефетч по SSE и обычная сортировка по lastMessageAt), плавно перемещается, а не
   прыгает мгновенно — то самое "оживление" интерфейса, о котором просили. */
.conversation-row-move {
  transition: transform 0.3s ease;
}
</style>
