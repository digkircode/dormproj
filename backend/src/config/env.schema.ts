import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  EXTERNAL_API_URL: z.url(),
  EXTERNAL_API_LOGIN: z.string().min(1),
  EXTERNAL_API_PASSWORD: z.string().min(1),
  EXTERNAL_API_INDIVIDUALS_URL: z.url(),
  EXTERNAL_API_CITIZENSHIP_URL: z.url(),
  ROSNOU_ID_BASE_URL: z.url(),
  ROSNOU_ID_CLIENT_ID: z.string().min(1),
  ROSNOU_ID_CLIENT_SECRET: z.string().min(1),
  ROSNOU_ID_REDIRECT_URI: z.url(),
  FRONTEND_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
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
