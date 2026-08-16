ALTER TABLE "room_characteristic_definitions" ADD COLUMN "is_protected" BOOLEAN NOT NULL DEFAULT false;

-- Стартовые 4 характеристики из 1С-выгрузки — защищены от удаления через UI (см. контроллер),
-- всё, что заведут сотрудники сами, остаётся удаляемым по умолчанию.
UPDATE "room_characteristic_definitions"
SET "is_protected" = true
WHERE "name" IN ('Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость');
