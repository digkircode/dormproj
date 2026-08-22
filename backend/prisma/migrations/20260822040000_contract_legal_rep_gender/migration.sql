-- Пол родителя/законного представителя (форма договора для несовершеннолетнего) — nullable.

ALTER TABLE "contracts" ADD COLUMN "legal_rep_gender" TEXT;
