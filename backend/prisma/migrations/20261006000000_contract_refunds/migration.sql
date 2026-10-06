CREATE TABLE "contract_refunds" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "accrual_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "refunded_at" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_refunds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_refunds_contract_id_refunded_at_idx" ON "contract_refunds"("contract_id", "refunded_at");
CREATE INDEX "contract_refunds_accrual_id_idx" ON "contract_refunds"("accrual_id");

ALTER TABLE "contract_refunds" ADD CONSTRAINT "contract_refunds_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_refunds" ADD CONSTRAINT "contract_refunds_accrual_id_fkey" FOREIGN KEY ("accrual_id") REFERENCES "accruals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_refunds" ADD CONSTRAINT "contract_refunds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
