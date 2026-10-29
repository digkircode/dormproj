const { MAX_BOT_TOKEN: token, MAX_BOT_USERNAME: username, MAX_WEBHOOK_SECRET: secret, FRONTEND_URL: frontendUrl } = process.env;

if (!token || !username || !secret || !frontendUrl) {
  console.error('Нужны MAX_BOT_TOKEN, MAX_BOT_USERNAME, MAX_WEBHOOK_SECRET и FRONTEND_URL в окружении backend.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{5,256}$/.test(secret)) {
  console.error('MAX_WEBHOOK_SECRET должен содержать 5–256 символов A-Z, a-z, 0-9, _ или -.');
  process.exit(1);
}

const webhookUrl = new URL('/api/notification-webhooks/max', frontendUrl).toString();
if (!webhookUrl.startsWith('https://')) {
  console.error('FRONTEND_URL должен использовать HTTPS.');
  process.exit(1);
}

const apiUrl = 'https://platform-api2.max.ru/subscriptions';
const headers = { Authorization: token, 'Content-Type': 'application/json' };

try {
  const botCheck = await fetch('https://platform-api2.max.ru/me', {
    headers: { Authorization: token }, signal: AbortSignal.timeout(15000),
  });
  const bot = await botCheck.json();
  if (!botCheck.ok || bot.username?.toLowerCase() !== username.replace(/^@/, '').toLowerCase()) {
    throw new Error(`MAX GET /me: токен и MAX_BOT_USERNAME не соответствуют одному боту (HTTP ${botCheck.status}).`);
  }

  const response = await fetch(apiUrl, {
    method: 'POST', headers,
    body: JSON.stringify({ url: webhookUrl, update_types: ['bot_started', 'bot_stopped'], secret }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) throw new Error(`MAX POST /subscriptions: HTTP ${response.status}, success=${result.success}`);

  const check = await fetch(apiUrl, { headers: { Authorization: token }, signal: AbortSignal.timeout(15000) });
  const listed = await check.json();
  const subscription = listed.subscriptions?.find((item) => item.url === webhookUrl);
  if (!check.ok || !subscription?.update_types?.includes('bot_started') || !subscription.update_types.includes('bot_stopped')) {
    throw new Error(`MAX GET /subscriptions: подписка не подтверждена (HTTP ${check.status}).`);
  }
  console.log(`Webhook MAX подключён: ${webhookUrl}; события: bot_started, bot_stopped.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Ошибка настройки webhook MAX.');
  process.exitCode = 1;
}
