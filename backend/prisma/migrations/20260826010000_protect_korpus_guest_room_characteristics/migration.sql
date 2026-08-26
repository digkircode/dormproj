-- "Корпус" (room_characteristic_options, 2026-08-23) и "Гостевая" (room_guest_characteristic,
-- 2026-08-23) заводились как обычные, не защищённые характеристики — по прямой просьбе
-- 2026-08-26 делаем их неудаляемыми через UI и напрямую HTTP-запросом (DELETE
-- /room-characteristic-definitions/:id), тем же is_protected, что и у стартовых 4
-- характеристик из 1С-выгрузки (см. схему и room-characteristic-definitions.controller.ts —
-- проверка isProtected там уже есть, тут только меняем данные). Переименовывать/менять
-- единицу измерения/варианты по-прежнему можно — блокируется только delete.
UPDATE room_characteristic_definitions
SET is_protected = true
WHERE name IN ('Корпус', 'Гостевая');
