-- Та же проблема, что уже решали для individuals/students (см. 20260812213038_ru_collation,
-- 20260813193000_individuals_ru_collation): колонка создавалась под collation базы по
-- умолчанию (en_US.utf8), из-за чего "Ё" сортируется/фильтруется не на своём месте в
-- ORDER BY (список пользователей всегда сортируется по full_name, см. users.controller.ts).
-- ru-RU-x-icu — родная для этого образа Postgres ICU-коллация с правильным русским
-- алфавитным порядком.
ALTER TABLE "users" ALTER COLUMN "full_name" TYPE TEXT COLLATE "ru-RU-x-icu";
