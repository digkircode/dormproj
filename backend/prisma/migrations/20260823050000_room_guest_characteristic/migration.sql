-- Новая характеристика "Гостевая" (BOOLEAN) — по прямой просьбе 2026-08-23, флаг у
-- каждой комнаты, да/нет. На момент введения гостевые — ровно те же 112-2/410-2, что уже
-- отдельно выделены как полностью посуточные (см. contracts.controller.ts#isDailyOnlyRoom
-- и миграцию room_price_by_university_category) — но признак хранится явно, не через
-- отсутствие обеих характеристик "Стоимость". Не protected — сотрудники могут поправить
-- (в отличие от свежезащищённых значений цены выше).
INSERT INTO room_characteristic_definitions (name, value_type, unit, is_protected, sort_order)
VALUES ('Гостевая', 'BOOLEAN', NULL, false, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM room_characteristic_definitions));

INSERT INTO room_characteristic_values (room_id, definition_id, period, value_bool, is_protected)
SELECT r.id, d.id, now(), (r.room IN ('112-2', '410-2')), false
FROM rooms r
CROSS JOIN (SELECT id FROM room_characteristic_definitions WHERE name = 'Гостевая') d;
