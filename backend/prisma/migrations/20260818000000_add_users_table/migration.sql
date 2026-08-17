-- Привязка SSO-аккаунтов (rosnou-id/Azure) к физлицам — разовый импорт из legacy БД
-- (users + users_binds), только id/bind_id/azure_id/univer_id/full_name, см. User в
-- schema.prisma. Данные сюда заполняет отдельный одноразовый скрипт, не эта миграция.
CREATE TABLE "users" (
    "id" INTEGER NOT NULL,
    "bind_id" TEXT,
    "azure_id" TEXT,
    "univer_id" TEXT,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_univer_id_key" ON "users"("univer_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_univer_id_fkey" FOREIGN KEY ("univer_id") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE SET NULL ON UPDATE CASCADE;
