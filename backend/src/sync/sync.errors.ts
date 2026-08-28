export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('Синхронизация уже выполняется');
  }
}

export class SyncGuardTrippedError extends Error {}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Путь контейнера, куда собирается бэкенд (см. Dockerfile#WORKDIR) — стек вызовов
// Node.js несёт его в каждой строке (например "/app/dist/sync/sync.service.js:132:15"),
// раскрывая структуру файловой системы прода. SyncLog.errorStack отдаётся по API как
// есть и рендерится в <pre> на /sync/:slug/logs (сейчас только ADMIN, но без единой
// правки) — вырезаем префикс и обрезаем длину стека здесь же, один раз для всех
// sync-сервисов, вместо того чтобы сохранять error.stack напрямую (было раньше, см.
// известную проблему в промпте проекта).
const CONTAINER_PATH_PREFIX = /\/app\//g;
// Не про секретность (после вырезания пути там уже нет ничего внутреннего) — просто
// не раздувать SyncLog/UI служебными фреймами глубоко внутри Node/Prisma.
const MAX_STACK_LINES = 12;

export function sanitizeErrorStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  return error.stack.replace(CONTAINER_PATH_PREFIX, '').split('\n').slice(0, MAX_STACK_LINES).join('\n');
}
