-- guid — теперь nullable: комнаты, заведённые вручную через UI, не имеют 1С-идентификатора.
ALTER TABLE "rooms" ALTER COLUMN "guid" DROP NOT NULL;

-- Сгенерированная (STORED) колонка, тем же способом, что birth_date_text у individuals —
-- Prisma не умеет объявлять GENERATED ALWAYS AS через schema.prisma, миграция написана руками.
-- Берёт ведущие цифры номера комнаты до первого не-цифрового символа ("405-2" -> 4,
-- "302-3-1" -> 3). Если номер не начинается с цифры (нетиповая комната, заведённая вручную) —
-- regexp не матчится, substring возвращает NULL, колонка остаётся NULL, а не падает.
ALTER TABLE "rooms" ADD COLUMN "floor" INTEGER GENERATED ALWAYS AS (
  (substring("room" from '^\d+'))::integer
) STORED;

-- CreateEnum
CREATE TYPE "RoomCharacteristicValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'TEXT');

-- CreateTable
CREATE TABLE "room_characteristic_definitions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value_type" "RoomCharacteristicValueType" NOT NULL,
    "unit" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_characteristic_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_characteristic_definitions_name_key" ON "room_characteristic_definitions"("name");

-- CreateTable
CREATE TABLE "room_characteristic_values" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "definition_id" INTEGER NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "value_bool" BOOLEAN,
    "value_number" DECIMAL(12,2),
    "value_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_characteristic_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_characteristic_values_room_id_definition_id_period_key" ON "room_characteristic_values"("room_id", "definition_id", "period");

CREATE INDEX "room_characteristic_values_room_id_idx" ON "room_characteristic_values"("room_id");

-- AddForeignKey
ALTER TABLE "room_characteristic_values" ADD CONSTRAINT "room_characteristic_values_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_characteristic_values" ADD CONSTRAINT "room_characteristic_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "room_characteristic_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
