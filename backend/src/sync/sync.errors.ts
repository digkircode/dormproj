export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('Синхронизация уже выполняется');
  }
}

export class SyncGuardTrippedError extends Error {}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const CONTAINER_PATH_PREFIX = /\/app\//g;
const MAX_STACK_LINES = 12;

export function sanitizeErrorStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  return error.stack.replace(CONTAINER_PATH_PREFIX, '').split('\n').slice(0, MAX_STACK_LINES).join('\n');
}
