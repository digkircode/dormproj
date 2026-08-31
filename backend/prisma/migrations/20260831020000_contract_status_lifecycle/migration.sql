-- ContractStatus: полный жизненный цикл (см. schema.prisma) — ACTIVE -> EXPIRING (≤30 дней
-- до endDate) -> COMPLETED (нет долга) / OVERDUE (есть долг), TERMINATED — вручную в любой
-- момент. EXPIRED убран — не использовался нигде (0 строк с этим значением на момент
-- миграции). Postgres не даёт удалить/переименовать значение enum напрямую — пересоздаём тип.
ALTER TYPE "ContractStatus" RENAME TO "ContractStatus_old";

CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'OVERDUE', 'COMPLETED', 'TERMINATED');

ALTER TABLE "contracts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contracts" ALTER COLUMN "status" TYPE "ContractStatus" USING ("status"::text::"ContractStatus");
ALTER TABLE "contracts" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "ContractStatus_old";
