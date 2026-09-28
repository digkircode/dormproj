CREATE TABLE "chat_stored_files" (
    "id" SERIAL NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_stored_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_stored_files_storage_key_key" ON "chat_stored_files"("storage_key");

-- Keep every existing attachment ID and physical file. Only move its storage key.
INSERT INTO "chat_stored_files" ("storage_key", "created_at")
SELECT "storage_key", "created_at" FROM "chat_attachments";
ALTER TABLE "chat_attachments" ADD COLUMN "file_id" INTEGER;
UPDATE "chat_attachments" AS attachment
SET "file_id" = stored."id"
FROM "chat_stored_files" AS stored
WHERE attachment."storage_key" = stored."storage_key";
ALTER TABLE "chat_attachments" ALTER COLUMN "file_id" SET NOT NULL;
DROP INDEX "chat_attachments_storage_key_key";
ALTER TABLE "chat_attachments" DROP COLUMN "storage_key";
CREATE INDEX "chat_attachments_file_id_idx" ON "chat_attachments"("file_id");
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "chat_stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "ChatBroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TABLE "chat_broadcasts" (
    "id" SERIAL NOT NULL,
    "request_id" TEXT NOT NULL,
    "sender_user_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_broadcasts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_broadcasts_request_id_key" ON "chat_broadcasts"("request_id");
ALTER TABLE "chat_broadcasts" ADD CONSTRAINT "chat_broadcasts_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_broadcast_files" (
    "id" SERIAL NOT NULL,
    "broadcast_id" INTEGER NOT NULL,
    "file_id" INTEGER NOT NULL,
    "kind" "ChatAttachmentKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    CONSTRAINT "chat_broadcast_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_broadcast_files_broadcast_id_file_id_key" ON "chat_broadcast_files"("broadcast_id", "file_id");
ALTER TABLE "chat_broadcast_files" ADD CONSTRAINT "chat_broadcast_files_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "chat_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_broadcast_files" ADD CONSTRAINT "chat_broadcast_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "chat_stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_broadcast_recipients" (
    "id" SERIAL NOT NULL,
    "broadcast_id" INTEGER NOT NULL,
    "individual_uid" TEXT NOT NULL,
    "status" "ChatBroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "message_id" INTEGER,
    CONSTRAINT "chat_broadcast_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_broadcast_recipients_message_id_key" ON "chat_broadcast_recipients"("message_id");
CREATE UNIQUE INDEX "chat_broadcast_recipients_broadcast_id_individual_uid_key" ON "chat_broadcast_recipients"("broadcast_id", "individual_uid");
CREATE INDEX "chat_broadcast_recipients_status_id_idx" ON "chat_broadcast_recipients"("status", "id");
ALTER TABLE "chat_broadcast_recipients" ADD CONSTRAINT "chat_broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "chat_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_broadcast_recipients" ADD CONSTRAINT "chat_broadcast_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
