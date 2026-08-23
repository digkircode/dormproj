import type { ChatSenderRole } from '../../generated/prisma/client.js';

// Прочитано ли сообщение "той стороной" — для STAFF-сообщений сравниваем с
// residentLastReadAt диалога, для RESIDENT-сообщений — со staffLastReadAt (см. "статусы
// сообщений" в промпте проекта: 2 закрашенные галочки = прочитано). Общая функция для
// chats.controller.ts и my-chat.controller.ts, чтобы формула не разошлась между ними.
export function isMessageRead(
  senderRole: ChatSenderRole,
  createdAt: Date,
  conversation: { staffLastReadAt: Date | null; residentLastReadAt: Date | null } | null,
): boolean {
  if (!conversation) return false;
  const readAt = senderRole === 'STAFF' ? conversation.residentLastReadAt : conversation.staffLastReadAt;
  return !!readAt && readAt >= createdAt;
}
