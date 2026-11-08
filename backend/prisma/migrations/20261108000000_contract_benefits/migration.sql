CREATE TYPE "ContractBenefit" AS ENUM ('NONE', 'PARTIAL', 'FREE');

ALTER TABLE "contracts" ADD COLUMN "benefit" "ContractBenefit" NOT NULL DEFAULT 'NONE';
