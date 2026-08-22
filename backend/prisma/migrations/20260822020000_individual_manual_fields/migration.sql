-- Поля ручного ввода на individuals — форма "Новое физическое лицо" + родитель
-- несовершеннолетнего при создании договора (contracts.controller.ts). Все nullable,
-- для синхронизируемых из 1С физлиц остаются null.

ALTER TABLE "individuals" ADD COLUMN "phone" TEXT;
ALTER TABLE "individuals" ADD COLUMN "email" TEXT;
ALTER TABLE "individuals" ADD COLUMN "address" TEXT;
ALTER TABLE "individuals" ADD COLUMN "passport_series" TEXT;
ALTER TABLE "individuals" ADD COLUMN "passport_number" TEXT;
ALTER TABLE "individuals" ADD COLUMN "passport_issued_by" TEXT;
ALTER TABLE "individuals" ADD COLUMN "passport_issued_code" TEXT;
ALTER TABLE "individuals" ADD COLUMN "passport_issued_at" TIMESTAMP(3);
