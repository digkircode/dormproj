-- Singleton-таблица финансовых показателей общежития в целом (не по комнатам) —
-- см. DormitoryInfo в schema.prisma. Строка с id=1 создаётся приложением через upsert
-- на первом чтении/записи (DormitoryInfoController), не здесь.
CREATE TABLE "dormitory_info" (
    "id" INTEGER NOT NULL,
    "communal_services_cost" DECIMAL(12,2),
    "daily_payment_internal" DECIMAL(12,2),
    "daily_payment_other" DECIMAL(12,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dormitory_info_pkey" PRIMARY KEY ("id")
);
