-- Закрытый список допустимых значений для TEXT-характеристик комнат (пусто = обычное
-- свободное поле, как раньше) — общий механизм, не привязан к конкретному имени.

-- AlterTable
ALTER TABLE "room_characteristic_definitions" ADD COLUMN "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Новая характеристика "Корпус" (TEXT, варианты "Новый"/"Старый") — по прямой просьбе.
-- Не protected — сотрудники редактируют как обычно. Значения по комнатам НЕ заводятся —
-- источника данных, какая комната к какому корпусу относится, нет, сотрудники проставляют
-- вручную через RoomDetailPanel.vue (Select ограничен этими двумя вариантами).
INSERT INTO room_characteristic_definitions (name, value_type, unit, is_protected, sort_order, options)
VALUES ('Корпус', 'TEXT', NULL, false, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM room_characteristic_definitions), ARRAY['Новый', 'Старый']);
