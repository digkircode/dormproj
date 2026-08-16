-- is_protected на значениях характеристик — исторические данные на 01.09.2026 (вся
-- стартовая выгрузка 1С, включая этаж ниже) заблокированы от правки/удаления навсегда.
ALTER TABLE "room_characteristic_values" ADD COLUMN "is_protected" BOOLEAN NOT NULL DEFAULT false;
UPDATE "room_characteristic_values" SET "is_protected" = true WHERE "period" = '2026-09-01';

-- Этаж — раньше сгенерированная колонка (regexp по номеру), теперь обычная защищённая
-- характеристика: задаётся вручную при создании комнаты, видна и редактируется там же,
-- где остальные характеристики (с историей, если понадобится).
INSERT INTO "room_characteristic_definitions" ("name", "value_type", "unit", "is_protected")
VALUES ('Этаж', 'NUMBER', NULL, true);

-- Переносим уже посчитанные значения из старой generated-колонки floor, пока она ещё
-- жива, тем же периодом и protected-статусом, что остальные 4 характеристики.
INSERT INTO "room_characteristic_values" ("room_id", "definition_id", "period", "value_number", "is_protected")
SELECT r.id, (SELECT id FROM "room_characteristic_definitions" WHERE name = 'Этаж'), '2026-09-01'::timestamp, r.floor, true
FROM "rooms" r
WHERE r.floor IS NOT NULL;

ALTER TABLE "rooms" DROP COLUMN "floor";
