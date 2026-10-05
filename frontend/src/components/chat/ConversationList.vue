<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageSquarePlus, Search } from 'lucide-vue-next'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { avatarColorClasses, initials } from '@/lib/avatar-color'
import { dateLocaleTag } from '@/lib/format-locale'
import type { ChatConversationListItem } from '@/lib/chat-api'

const props = defineProps<{
  conversations: ChatConversationListItem[]
  selectedId: number | null
  isLoading?: boolean
  error?: string
}>()

const emit = defineEmits<{ select: [id: number]; 'new-message': [] }>()

const { t } = useI18n()

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
    return date.toLocaleTimeString(dateLocaleTag(), { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(dateLocaleTag(), { day: '2-digit', month: '2-digit' })
}
</script>

<template>
  <div class="flex min-h-0 w-80 shrink-0 flex-col border-r">
    <div class="flex items-center gap-2 border-b p-3">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="query" :placeholder="t('chat.list.searchPlaceholder')" class="pl-9" />
      </div>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button size="icon" @click="emit('new-message')">
            <MessageSquarePlus class="size-4" />
            <span class="sr-only">{{ t('chat.list.newMessage') }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('chat.list.newMessage') }}</TooltipContent>
      </Tooltip>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div v-if="isLoading" role="status" :aria-label="t('entityTable.loading')">
        <div v-for="row in 7" :key="row" class="flex items-center gap-3 border-b p-3" aria-hidden="true">
          <Skeleton class="size-10 shrink-0 rounded-full" />
          <div class="min-w-0 flex-1 space-y-2"><Skeleton class="h-4 w-3/4" /><Skeleton class="h-3 w-full" /></div>
        </div>
        <span class="sr-only">{{ t('entityTable.loading') }}</span>
      </div>
      <p v-else-if="error && !conversations.length" class="p-4 text-center text-sm text-destructive">{{ error }}</p>
      <p v-else-if="filtered.length === 0" class="p-4 text-center text-sm text-muted-foreground">{{ t('chat.list.noDialogsFound') }}</p>
      <TransitionGroup v-if="!isLoading" name="conversation-row" tag="div">
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
              >{{ conversation.lastMessage ?? t('chat.list.noMessages') }}</span>
              <span v-if="conversation.unread" class="size-2 shrink-0 rounded-full bg-primary" />
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
