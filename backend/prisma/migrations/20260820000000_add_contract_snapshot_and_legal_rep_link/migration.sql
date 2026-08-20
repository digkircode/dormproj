-- Снимок личных данных проживающего на момент подписания (resident_snapshot) — печать
-- договора не должна зависеть от того, что синхрон 1С перепишет паспорт/СНИЛС/адрес/
-- телефон позже. legal_rep_individual_uid — родитель несовершеннолетнего как отдельный
-- Individual(isManual=true), только для автоподстановки на следующем договоре того же
-- несовершеннолетнего (печатные данные конкретного договора по-прежнему в legal_rep_*).

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "legal_rep_individual_uid" TEXT,
ADD COLUMN     "resident_snapshot" JSONB;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legal_rep_individual_uid_fkey" FOREIGN KEY ("legal_rep_individual_uid") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE SET NULL ON UPDATE CASCADE;
