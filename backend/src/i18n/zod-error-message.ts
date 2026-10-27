import type { ZodError } from 'zod';

export function zodErrorMessage(error: ZodError): string {
  return error.issues[0]?.message ?? error.message;
}
