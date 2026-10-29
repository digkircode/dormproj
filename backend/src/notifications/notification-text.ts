export interface NotificationText {
  plain: string;
  telegramHtml: string;
}

const TELEGRAM_CONTENT_LIMIT = 4096;
const MAX_CONTENT_LIMIT = 4000;

export function fitMaxMessage(value: string): string {
  if (value.length <= MAX_CONTENT_LIMIT) return value;
  const lastLink = value.lastIndexOf('\n\n');
  const suffix = lastLink >= 0 ? value.slice(lastLink) : '';
  const prefix = lastLink >= 0 ? value.slice(0, lastLink) : value;
  const available = MAX_CONTENT_LIMIT - suffix.length - 1;
  return available > 0 ? `${prefix.slice(0, available).trimEnd()}…${suffix}` : `${value.slice(0, MAX_CONTENT_LIMIT - 1)}…`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function fitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function telegramLink(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

export function announcementNotification(title: string, body: string, url: string, en: boolean): NotificationText {
  const linkLabel = en ? 'Read announcement' : 'Читать объявление';
  const heading = `📢 ${title}`;
  const visibleBody = fitText(body, TELEGRAM_CONTENT_LIMIT - heading.length - linkLabel.length - 4);
  return {
    plain: `${heading}\n\n${visibleBody}\n\n${linkLabel}: ${url}`,
    telegramHtml: `📢 <b>${escapeHtml(title)}</b>\n\n${escapeHtml(visibleBody)}\n\n${telegramLink(url, linkLabel)}`,
  };
}

export function chatNotification(
  messages: { body: string | null; hasAttachments: boolean }[],
  url: string,
  en: boolean,
): NotificationText {
  const heading = messages.length === 1
    ? (en ? '💬 Message from staff' : '💬 Сообщение от администрации')
    : (en ? '💬 Messages from staff' : '💬 Сообщения от администрации');
  const linkLabel = en ? 'Open chat' : 'Открыть чат';
  const attachmentLabel = en ? '📎 Attachments' : '📎 Вложения';
  const shown = messages.slice(-3);
  const additionalCount = messages.length - shown.length;
  const more = additionalCount > 0
    ? (en ? `And ${additionalCount} more messages` : `И ещё ${additionalCount} сообщений`)
    : '';
  const attachments = messages.some((message) => message.hasAttachments) ? attachmentLabel : '';
  const bodies = shown.map((message) => message.body?.trim()).filter((value): value is string => !!value).join('\n\n');
  const reserved = heading.length + linkLabel.length + more.length + attachments.length + 12;
  const visibleBodies = fitText(bodies, TELEGRAM_CONTENT_LIMIT - reserved);
  const content = [visibleBodies, more, attachments].filter(Boolean).join('\n\n');
  return {
    plain: `${heading}\n\n${content}\n\n${linkLabel}: ${url}`,
    telegramHtml: `<b>${escapeHtml(heading)}</b>\n\n${escapeHtml(content)}\n\n${telegramLink(url, linkLabel)}`,
  };
}
