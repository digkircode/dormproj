import { z } from 'zod';

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
  FRONTEND_URL: z.url(),
  SESSION_SECRET: z.string().min(32),

  // Эквайринг ГПБ (онлайн-оплата проживающих, см. acquiring/) — все поля опциональны:
  // пока не заполнены, GazprombankAcquiringProvider.isConfigured() возвращает false и
  // страница оплаты показывает "временно недоступна", а не падает при старте бэкенда.
  GPB_ACQUIRING_BASE_URL: z.url().optional(),
  GPB_ACQUIRING_PORTAL_ID: z.string().min(1).optional(),
  GPB_ACQUIRING_MERCHANT_ID: z.string().min(1).optional(),
  GPB_ACQUIRING_ACCOUNT_ID: z.string().min(1).optional(),
  GPB_ACQUIRING_CLIENT_CERT_PATH: z.string().min(1).optional(),
  GPB_ACQUIRING_CLIENT_KEY_PATH: z.string().min(1).optional(),
  GPB_ACQUIRING_CLIENT_KEY_PASSPHRASE: z.string().min(1).optional(),

  // Цифровая касса Эвотор/АТОЛ Онлайн (фискализация чеков, см. fiscal/) — та же логика
  // опциональности, что и у эквайринга выше.
  ATOL_KASSA_BASE_URL: z.url().optional(),
  ATOL_KASSA_LOGIN: z.string().min(1).optional(),
  ATOL_KASSA_PASSWORD: z.string().min(1).optional(),
  ATOL_KASSA_GROUP_CODE: z.string().min(1).optional(),
  ATOL_KASSA_COMPANY_INN: z.string().min(1).optional(),
  ATOL_KASSA_COMPANY_EMAIL: z.string().min(1).optional(),
  ATOL_KASSA_COMPANY_SNO: z.string().min(1).optional(),
  ATOL_KASSA_PAYMENT_ADDRESS: z.string().min(1).optional(),

  // 1С Бухгалтерия — отправка платежей эквайринга (см. accounting-1c/), та же логика
  // опциональности, что у эквайринга/кассы выше. Basic Auth, как и остальные интеграции
  // с 1С в проекте (см. sync/external-student-api.service.ts).
  ACCOUNTING_1C_LOGIN: z.string().min(1).optional(),
  ACCOUNTING_1C_PASSWORD: z.string().min(1).optional(),
  ACCOUNTING_1C_SEND_PAYMENTS_URL: z.url().optional(),
  // Флоу 2 — получение платежей, пришедших мимо сайта (касса/перевод/по реквизитам).
  ACCOUNTING_1C_GET_PAYMENTS_URL: z.url().optional(),
  // Флоу 3 — ежемесячный документ "оказание услуг" (Найм/Коммуналка).
  ACCOUNTING_1C_SERVICE_PROVISION_URL: z.url().optional(),
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
