import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  EXTERNAL_API_URL: z.url(),
  EXTERNAL_API_LOGIN: z.string().min(1),
  EXTERNAL_API_PASSWORD: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Некорректные переменные окружения:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return result.data;
}
