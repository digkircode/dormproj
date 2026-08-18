-- Договоры найма — сами стороны/статус (contracts), финансовые условия с историей
-- (contract_terms, тот же принцип, что period у room_characteristic_values) и история
-- заселения в комнату (room_assignments, переезд не рвёт договор). См. Contract/
-- ContractTerms/RoomAssignment в schema.prisma.

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'TERMINATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DailyRateCategory" AS ENUM ('OWN_UNIVERSITY', 'OTHER_UNIVERSITY');

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "contract_date" TIMESTAMP(3) NOT NULL,
    "resident_individual_uid" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "actual_end_date" TIMESTAMP(3),
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "legal_rep_name" TEXT,
    "legal_rep_phone" TEXT,
    "legal_rep_passport_series" TEXT,
    "legal_rep_passport_number" TEXT,
    "legal_rep_passport_issued_by" TEXT,
    "legal_rep_passport_issued_at" TIMESTAMP(3),
    "legal_rep_address" TEXT,
    "mat_capital_covered_from" TIMESTAMP(3),
    "mat_capital_covered_to" TIMESTAMP(3),
    "mat_capital_deferred_until" TIMESTAMP(3),
    "renewed_from_contract_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");
CREATE INDEX "contracts_resident_individual_uid_idx" ON "contracts"("resident_individual_uid");
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_resident_individual_uid_fkey" FOREIGN KEY ("resident_individual_uid") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_renewed_from_contract_id_fkey" FOREIGN KEY ("renewed_from_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Та же коллация, что у остальных текстовых полей, по которым может идти поиск/сортировка
-- (см. individuals_ru_collation) — дефолтная en_US.utf8 сортирует "Ё" раньше "А".
ALTER TABLE "contracts" ALTER COLUMN "number" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "contracts" ALTER COLUMN "legal_rep_name" TYPE TEXT COLLATE "ru-RU-x-icu";

-- CreateTable
CREATE TABLE "contract_terms" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "utilities_amount" DECIMAL(12,2) NOT NULL,
    "daily_rate_category" "DailyRateCategory" NOT NULL,
    "daily_rate_amount" DECIMAL(12,2) NOT NULL,
    "payment_due_day" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_terms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_terms_contract_id_valid_from_idx" ON "contract_terms"("contract_id", "valid_from");

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "room_assignments" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "from_date" TIMESTAMP(3) NOT NULL,
    "to_date" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "room_assignments_contract_id_from_date_idx" ON "room_assignments"("contract_id", "from_date");
CREATE INDEX "room_assignments_room_id_from_date_idx" ON "room_assignments"("room_id", "from_date");

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
