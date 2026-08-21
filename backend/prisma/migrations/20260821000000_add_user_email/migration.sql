-- Email аккаунта users — заполняется/обновляется автоматически при каждом логине
-- из фолбека rosnou-id (SessionUser.email), не через форму.

ALTER TABLE "users" ADD COLUMN "email" TEXT;
