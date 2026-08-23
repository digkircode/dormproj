-- По прямой просьбе 2026-08-23 (вечер) — категории "из вуза"/"не из вуза", заведённые
-- миграцией 20260823010000_room_price_by_university_category в тот же день, оказались
-- перепутаны местами. Меняем ТЕКУЩЕЕ (с максимальным period) значение каждой пары местами
-- по каждой комнате и защищаем обе строки от случайного редактирования через UI
-- (is_protected = true, тот же смысл, что у исторической 1С-выгрузки).
CREATE TEMP TABLE _price_swap AS
SELECT
  own.id AS own_id,
  own.room_id,
  own.value_number AS own_price,
  other.id AS other_id,
  other.value_number AS other_price
FROM (
  SELECT DISTINCT ON (rcv.room_id) rcv.id, rcv.room_id, rcv.value_number
  FROM room_characteristic_values rcv
  JOIN room_characteristic_definitions d ON d.id = rcv.definition_id
  WHERE d.name = 'Стоимость (из вуза)'
  ORDER BY rcv.room_id, rcv.period DESC
) own
JOIN (
  SELECT DISTINCT ON (rcv.room_id) rcv.id, rcv.room_id, rcv.value_number
  FROM room_characteristic_values rcv
  JOIN room_characteristic_definitions d ON d.id = rcv.definition_id
  WHERE d.name = 'Стоимость (не из вуза)'
  ORDER BY rcv.room_id, rcv.period DESC
) other ON other.room_id = own.room_id;

UPDATE room_characteristic_values
SET value_number = _price_swap.other_price, is_protected = true
FROM _price_swap
WHERE room_characteristic_values.id = _price_swap.own_id;

UPDATE room_characteristic_values
SET value_number = _price_swap.own_price, is_protected = true
FROM _price_swap
WHERE room_characteristic_values.id = _price_swap.other_id;

DROP TABLE _price_swap;
