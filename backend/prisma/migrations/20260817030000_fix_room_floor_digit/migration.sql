-- Предыдущая версия (add_room_characteristics) брала ВСЕ ведущие цифры номера комнаты
-- ('^\d+') — для "405-2" это давало этаж 405 вместо 4, поскольку номер комнаты сам
-- трёхзначный (первая цифра — этаж, остальные — номер комнаты на этаже). Нужна ровно
-- первая цифра ('^\d', без +), Postgres не даёт ALTER express у GENERATED-колонки —
-- перевыставляем колонку целиком.
ALTER TABLE "rooms" DROP COLUMN "floor";

ALTER TABLE "rooms" ADD COLUMN "floor" INTEGER GENERATED ALWAYS AS (
  (substring("room" from '^\d'))::integer
) STORED;
