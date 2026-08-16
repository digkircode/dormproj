export { LOCK_STALE_MS, TRANSACTION_TIMEOUT_MS } from '../sync/sync.constants';

// Отдельный тип от 'individuals' (массовый синхрон физлиц) — этот синхронизирует
// одно физлицо сразу по всем 5 источникам, запускается только с его карточки.
export const SYNC_TYPE_INDIVIDUAL = 'individual';
