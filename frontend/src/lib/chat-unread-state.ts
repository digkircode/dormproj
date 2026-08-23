import { ref } from 'vue'

// Модульный singleton (тот же приём, что currentUser в auth-state.ts) — один и тот же
// реактивный флаг читают и AppSidebar.vue (бейджик-кружок у пунктов меню, живёт всегда,
// пока пользователь залогинен), и сами страницы чата (Chats.vue/MyChat.vue, сбрасывают
// флаг сразу после пометки прочитанным, не дожидаясь следующего SSE-события).
export const hasUnreadStaffChats = ref(false)
export const hasUnreadResidentChat = ref(false)
