-- Онлайн-оплата проживающих (эквайринг ГПБ) — черновик попытки платежа до подтверждения
-- банком, см. PaymentIntent в schema.prisma. Payment (основной леджер) не трогается.

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'PENDING_BANK', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "description" TEXT NOT NULL,
    "payer_full_name" TEXT NOT NULL,
    "payer_email" TEXT,
    "payer_phone" TEXT,
    "bank_token" TEXT,
    "bank_raw_status" JSONB,
    "fiscal_uuid" TEXT,
    "fiscal_status" TEXT,
    "fiscal_receipt_url" TEXT,
    "failure_reason" TEXT,
    "payment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_intents_bank_token_key" ON "payment_intents"("bank_token");
CREATE UNIQUE INDEX "payment_intents_payment_id_key" ON "payment_intents"("payment_id");
CREATE INDEX "payment_intents_contract_id_idx" ON "payment_intents"("contract_id");
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
