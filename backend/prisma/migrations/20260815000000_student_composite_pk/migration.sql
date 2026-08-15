-- Источник иногда отдаёт один и тот же ZachetnayaKnigaUID для разных физлиц
-- (FizicheskoyeLitsoUID) — единичный PK на зачётке ловил constraint violation
-- при полной перезаписи. Составной PK разрешает такие дубли, оставаясь
-- уникальным для реальной пары "зачётка + физлицо".
ALTER TABLE "students" DROP CONSTRAINT "students_pkey";
ALTER TABLE "students" ADD CONSTRAINT "students_pkey" PRIMARY KEY ("zachetnaya_kniga_uid", "fizicheskoye_litso_uid");
