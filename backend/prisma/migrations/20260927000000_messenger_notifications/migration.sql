CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'MAX');
ALTER TABLE "users" ADD COLUMN "notification_locale" TEXT NOT NULL DEFAULT 'ru';
CREATE TYPE "NotificationKind" AS ENUM ('ANNOUNCEMENT', 'CHAT');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED');

CREATE TABLE "notification_links" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" "NotificationChannel" NOT NULL,
  "external_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_links_user_id_channel_key" UNIQUE ("user_id", "channel"),
  CONSTRAINT "notification_links_channel_external_id_key" UNIQUE ("channel", "external_id")
);

CREATE TABLE "notification_link_tokens" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" "NotificationChannel" NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "notification_link_tokens_user_id_channel_idx" ON "notification_link_tokens"("user_id", "channel");

CREATE TABLE "notification_deliveries" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" "NotificationChannel" NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "source_id" INTEGER NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "due_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "provider_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_deliveries_user_id_channel_kind_source_id_key" UNIQUE ("user_id", "channel", "kind", "source_id")
);
CREATE INDEX "notification_deliveries_status_due_at_idx" ON "notification_deliveries"("status", "due_at");
