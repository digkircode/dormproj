-- Две новые справочные величины настроек общежития (по прямой просьбе 2026-08-23) —
-- используются страницей "Проживающий → Общая информация" (StudentGeneralInfo.vue),
-- см. schema.prisma для комментария.
ALTER TABLE "dormitory_info" ADD COLUMN "pass_restoration_cost" DECIMAL(12,2);
ALTER TABLE "dormitory_info" ADD COLUMN "guest_room_daily_rate" DECIMAL(12,2);

-- updated_at без дефолта в БД (проставляется на уровне Prisma @updatedAt, не колонкой) —
-- строка-синглтон до сих пор нигде не создавалась на этой базе (GET её только upsert'ит
-- лениво), поэтому INSERT обязан задать updated_at явно, иначе NOT NULL constraint.
INSERT INTO dormitory_info (id, pass_restoration_cost, guest_room_daily_rate, updated_at)
VALUES (1, 1000, 1500, now())
ON CONFLICT (id) DO UPDATE SET pass_restoration_cost = 1000, guest_room_daily_rate = 1500, updated_at = now();
