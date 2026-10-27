CREATE TABLE "sync_job_settings" (
    "job_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_job_settings_pkey" PRIMARY KEY ("job_id")
);
