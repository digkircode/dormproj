export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('Синхронизация уже выполняется');
  }
}

export class SyncGuardTrippedError extends Error {}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
