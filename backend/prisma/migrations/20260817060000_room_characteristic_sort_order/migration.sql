ALTER TABLE "room_characteristic_definitions" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Бэкафилл по текущему id — тот же порядок, что уже был (по умолчанию сортировали
-- по id), дальше сотрудники смогут перетаскивать вручную через UI.
UPDATE "room_characteristic_definitions" SET "sort_order" = id;
