-- Сгенерированная (STORED) колонка, а не обычная — Prisma не умеет объявлять такое
-- через schema.prisma, поэтому миграция написана руками. Даёт возможность искать по
-- дате рождения тем же ILIKE-поиском ("contains"), что и текстовые поля, без сырого
-- SQL в самом запросе списка. Пересчитывается автоматически при каждой записи birth_date.
--
-- to_char() не годится для generated-колонки — Postgres требует IMMUTABLE выражение,
-- а to_char() зависит от текущей locale (STABLE). EXTRACT/lpad/конкатенация — immutable
-- для timestamp без часового пояса (наш birth_date — TIMESTAMP(3), без tz).
ALTER TABLE "individuals" ADD COLUMN "birth_date_text" TEXT GENERATED ALWAYS AS (
  lpad(EXTRACT(DAY FROM "birth_date")::text, 2, '0') || '.' ||
  lpad(EXTRACT(MONTH FROM "birth_date")::text, 2, '0') || '.' ||
  EXTRACT(YEAR FROM "birth_date")::text
) STORED;
