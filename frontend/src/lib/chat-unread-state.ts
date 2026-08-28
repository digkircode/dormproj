import { ref } from 'vue'

// Модульный singleton (тот же приём, что currentUser в auth-state.ts) — один и тот же
// реактивный флаг читают и AppSidebar.vue (бейджик-кружок у пунктов меню, живёт всегда,
// пока пользователь залогинен), и сами страницы чата (Chats.vue/MyChat.vue, сбрасывают
// флаг сразу после пометки прочитанным, не дожидаясь следующего SSE-события).
export const hasUnreadStaffChats = ref(false)
export const hasUnreadResidentChat = ref(false)
// Точное число непрочитанных (не только факт "есть/нет") — для плашки "Новых сообщений: N"
// на главной резидента (ResidentHomeDashboard.vue), тот же singleton, обновляется тем же
// местом (AppSidebar.vue#refreshResidentUnread), что и hasUnreadResidentChat выше.
export const residentUnreadCount = ref(0)
