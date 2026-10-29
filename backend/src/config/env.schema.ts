import { z } from 'zod';

const portalHttpsUrl = z.url().refine((value) => new URL(value).protocol === 'https:', 'Требуется HTTPS');
const optionalAccountingText = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const optionalAccountingUrl = z.preprocess((value) => value === '' ? undefined : value, z.url().optional());

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  EXTERNAL_API_URL: z.url(),
  EXTERNAL_API_LOGIN: z.string().min(1),
  EXTERNAL_API_PASSWORD: z.string().min(1),
  EXTERNAL_API_INDIVIDUALS_URL: z.url(),
  EXTERNAL_API_CITIZENSHIP_URL: z.url(),
  EXTERNAL_API_PASSPORT_URL: z.url(),
  EXTERNAL_API_CONTACT_INFO_URL: z.url(),
  ROSNOU_ID_BASE_URL: z.url(),
  ROSNOU_ID_CLIENT_ID: z.string().min(1),
  ROSNOU_ID_CLIENT_SECRET: z.string().min(1),
  ROSNOU_ID_REDIRECT_URI: z.url(),
  PORTAL_API_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, portalHttpsUrl.optional()),
  PORTAL_API_CLIENT_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  PORTAL_API_CLIENT_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  PORTAL_API_USERS_URL: z.preprocess((value) => value === '' ? undefined : value, portalHttpsUrl.optional()),
  FRONTEND_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(5).optional(),
  MAX_BOT_TOKEN: z.string().min(1).optional(),
  MAX_BOT_USERNAME: z.string().min(1).optional(),
  MAX_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{5,256}$/, 'Секрет MAX: 5–256 символов A-Z, a-z, 0-9, _ или -').optional(),

  GPB_ACQUIRING_BASE_URL: z.url().optional(),
  GPB_ACQUIRING_PORTAL_ID: z.string().min(1).optional(),
  GPB_ACQUIRING_MERCHANT_ID: z.string().min(1).optional(),
  GPB_ACQUIRING_ACCOUNT_ID: z.string().min(1).optional(),
  GPB_ACQUIRING_CLIENT_CERT_PATH: z.string().min(1).optional(),
  GPB_ACQUIRING_CLIENT_KEY_PATH: z.string().min(1).optional(),
  GPB_ACQUIRING_CLIENT_KEY_PASSPHRASE: z.string().min(1).optional(),

  ATOL_KASSA_BASE_URL: z.url().optional(),
  ATOL_KASSA_LOGIN: z.string().min(1).optional(),
  ATOL_KASSA_PASSWORD: z.string().min(1).optional(),
  ATOL_KASSA_GROUP_CODE: z.string().min(1).optional(),
  ATOL_KASSA_COMPANY_INN: z.string().min(1).optional(),
  ATOL_KASSA_COMPANY_EMAIL: z.string().min(1).optional(),
  ATOL_KASSA_COMPANY_SNO: z.string().min(1).optional(),
  ATOL_KASSA_PAYMENT_ADDRESS: z.string().min(1).optional(),

  ACCOUNTING_1C_LOGIN: optionalAccountingText,
  ACCOUNTING_1C_PASSWORD: optionalAccountingText,
  ACCOUNTING_1C_SEND_PAYMENTS_URL: optionalAccountingUrl,
  ACCOUNTING_1C_GET_PAYMENTS_URL: optionalAccountingUrl,
  ACCOUNTING_1C_SERVICE_PROVISION_URL: optionalAccountingUrl,
  ACCOUNTING_1C_CONTRACTOR_CREATE_URL: optionalAccountingUrl,
  ACCOUNTING_1C_CONTRACT_CREATE_URL: optionalAccountingUrl,
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
