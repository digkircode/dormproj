-- Ночной полный ресинк гражданства/паспорта/контактов уничтожал данные, перенесённые
-- слиянием ручного физлица с синхронной записью (deleteMany без исключения для таких
-- строк — код-ревью 2026-09-04, см. промпт проекта). preserved_from_merge помечает
-- строку как перенесённую слиянием (individuals.controller.ts#merge), чтобы ресинк
-- (citizenship-sync/passport-sync/contact-info-sync) её не трогал.
ALTER TABLE "citizenships" ADD COLUMN "preserved_from_merge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "passports" ADD COLUMN "preserved_from_merge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contact_infos" ADD COLUMN "preserved_from_merge" BOOLEAN NOT NULL DEFAULT false;
