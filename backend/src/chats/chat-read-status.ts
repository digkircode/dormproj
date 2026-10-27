import type { ChatSenderRole } from '../../generated/prisma/client.js';

export function isMessageRead(
  senderRole: ChatSenderRole,
  createdAt: Date,
  conversation: { staffLastReadAt: Date | null; residentLastReadAt: Date | null } | null,
): boolean {
  if (!conversation) return false;
  const readAt = senderRole === 'STAFF' ? conversation.residentLastReadAt : conversation.staffLastReadAt;
  return !!readAt && readAt >= createdAt;
}
