-- Вложения к сообщениям чата (фото/видео) — файл лежит на диске backend-контейнера
-- (persistent volume), тут только метаданные. Сообщение теперь может быть без текста
-- (только вложение, как в Telegram) — body стал nullable.

-- AlterTable
ALTER TABLE "chat_messages" ALTER COLUMN "body" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "ChatAttachmentKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "kind" "ChatAttachmentKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_attachments_storage_key_key" ON "chat_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "chat_attachments_message_id_idx" ON "chat_attachments"("message_id");

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
