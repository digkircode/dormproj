-- CreateTable
CREATE TABLE "individuals" (
    "fizicheskoye_litso_uid" TEXT NOT NULL,
    "delete_mark" BOOLEAN NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "otchestvo" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "inn" TEXT NOT NULL,
    "snils" TEXT NOT NULL,
    "photo_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "individuals_pkey" PRIMARY KEY ("fizicheskoye_litso_uid")
);
