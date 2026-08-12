-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "students" (
    "zachetnaya_kniga_uid" TEXT NOT NULL,
    "fizicheskoye_litso_uid" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "zachetnaya_kniga" TEXT NOT NULL,
    "ucheb_year" TEXT NOT NULL,
    "ucheb_plan" TEXT NOT NULL,
    "ucheb_plan_osnova" TEXT NOT NULL,
    "form_obuch" TEXT NOT NULL,
    "facultet" TEXT NOT NULL,
    "speciality" TEXT NOT NULL,
    "kurs" TEXT NOT NULL,
    "kurs_number" INTEGER NOT NULL,
    "study_group" TEXT NOT NULL,
    "ucheb_status" TEXT NOT NULL,
    "osnova_obuch" TEXT NOT NULL,
    "uroven_podgotov" TEXT NOT NULL,
    "profil_spec" TEXT,
    "dot" BOOLEAN NOT NULL,
    "facult_abbr" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("zachetnaya_kniga_uid")
);

-- CreateTable
CREATE TABLE "sync_locks" (
    "type" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_locks_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'students',
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "fetched_count" INTEGER,
    "added" INTEGER,
    "updated" INTEGER,
    "removed" INTEGER,
    "error_message" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_fizicheskoye_litso_uid_idx" ON "students"("fizicheskoye_litso_uid");

-- CreateIndex
CREATE INDEX "sync_logs_type_status_finished_at_idx" ON "sync_logs"("type", "status", "finished_at");
