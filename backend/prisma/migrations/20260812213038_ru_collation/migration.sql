-- Столбцы создавались под collation базы по умолчанию (en_US.utf8), в котором
-- "Ё" (U+0401) идёт раньше "А" (U+0410) — ORDER BY выдавал ФИО на "Ё" первыми.
-- ru-RU-x-icu — родная для этого образа Postgres ICU-коллация с правильным
-- русским алфавитным порядком.
ALTER TABLE "students" ALTER COLUMN "full_name" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "zachetnaya_kniga" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "study_group" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "kurs" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "facultet" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "speciality" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "form_obuch" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "osnova_obuch" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "uroven_podgotov" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "profil_spec" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "students" ALTER COLUMN "ucheb_year" TYPE TEXT COLLATE "ru-RU-x-icu";
