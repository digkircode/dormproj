import { announcementNotification, chatNotification } from './notification-text';

describe('notification text', () => {
  it('keeps the full announcement and escapes user content in Telegram HTML', () => {
    const result = announcementNotification('Заголовок <важно>', 'Текст & подробности', 'https://example.test/?a=1&b=2', false);
    expect(result.telegramHtml).toContain('<b>Заголовок &lt;важно&gt;</b>');
    expect(result.telegramHtml).toContain('Текст &amp; подробности');
    expect(result.telegramHtml).toContain('<a href="https://example.test/?a=1&amp;b=2">Читать объявление</a>');
    expect(result.plain).toContain('Текст & подробности');
  });

  it('fits long announcements within a Telegram message', () => {
    expect(announcementNotification('Важное', 'А'.repeat(4000), 'https://example.test/', false).telegramHtml).toContain('А'.repeat(4000));
    const result = announcementNotification('Важное '.repeat(25), 'А'.repeat(4000), 'https://example.test/', false);
    const visibleText = result.telegramHtml.replace(/<[^>]+>/g, '');
    expect(visibleText.length).toBeLessThanOrEqual(4096);
    expect(result.telegramHtml).toContain('Читать объявление</a>');
    expect(result.telegramHtml).toContain('…');
  });

  it('uses one attachment label and a labeled chat link', () => {
    const result = chatNotification([{ body: 'Привет <всем>', hasAttachments: true }], 'https://example.test/student/chat', false);
    expect(result.telegramHtml).toContain('Привет &lt;всем&gt;');
    expect(result.telegramHtml).toContain('📎 Вложения');
    expect(result.telegramHtml).toContain('>Открыть чат</a>');
    expect(result.plain).not.toMatch(/Фото|Видео/);
  });
});
