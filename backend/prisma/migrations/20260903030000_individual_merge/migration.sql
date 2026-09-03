-- Слияние ручного физлица (isManual) в настоящую синхронную запись из 1С Университет,
-- когда она появилась позже (частый случай — см. промпт проекта). Только по явному
-- действию сотрудника (individuals.controller.ts#merge), никогда автоматически синхроном.
-- Строка-источник не удаляется физически — помечается merged_into_uid.
ALTER TABLE "individuals" ADD COLUMN "merged_into_uid" TEXT;
ALTER TABLE "individuals" ADD COLUMN "merged_at" TIMESTAMP(3);

CREATE INDEX "individuals_merged_into_uid_idx" ON "individuals"("merged_into_uid");

ALTER TABLE "individuals" ADD CONSTRAINT "individuals_merged_into_uid_fkey"
  FOREIGN KEY ("merged_into_uid") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE SET NULL ON UPDATE CASCADE;
