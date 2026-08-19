-- Расширение блока законного представителя (родителя) под несовершеннолетних:
-- дата рождения, код подразделения паспорта, СНИЛС, ИНН — плюс справочная сумма
-- маткапитала (в леджер начислений/оплат не заводится, см. schema.prisma).

ALTER TABLE "contracts" ADD COLUMN "legal_rep_birth_date" TIMESTAMP(3);
ALTER TABLE "contracts" ADD COLUMN "legal_rep_passport_issued_code" TEXT;
ALTER TABLE "contracts" ADD COLUMN "legal_rep_snils" TEXT;
ALTER TABLE "contracts" ADD COLUMN "legal_rep_inn" TEXT;
ALTER TABLE "contracts" ADD COLUMN "mat_capital_amount" DECIMAL(12,2);
