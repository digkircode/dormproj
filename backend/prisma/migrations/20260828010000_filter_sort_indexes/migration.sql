-- Индексы под реальные фильтры/сортировки (Individual/Student/Room.room ни разу не были
-- проиндексированы, кроме PK) — без них список читает всю таблицу целиком на каждый
-- список/фильтр/сортировку (seq scan), см. известную проблему в промпте проекта.

-- CreateIndex
CREATE INDEX "students_full_name_idx" ON "students"("full_name");
CREATE INDEX "students_study_group_idx" ON "students"("study_group");
CREATE INDEX "students_kurs_number_idx" ON "students"("kurs_number");
CREATE INDEX "students_facultet_idx" ON "students"("facultet");
CREATE INDEX "students_speciality_idx" ON "students"("speciality");
CREATE INDEX "students_form_obuch_idx" ON "students"("form_obuch");
CREATE INDEX "students_osnova_obuch_idx" ON "students"("osnova_obuch");
CREATE INDEX "students_uroven_podgotov_idx" ON "students"("uroven_podgotov");
CREATE INDEX "students_profil_spec_idx" ON "students"("profil_spec");
CREATE INDEX "students_dot_idx" ON "students"("dot");
CREATE INDEX "students_ucheb_year_idx" ON "students"("ucheb_year");

-- CreateIndex
CREATE INDEX "individuals_full_name_idx" ON "individuals"("full_name");
CREATE INDEX "individuals_code_idx" ON "individuals"("code");
CREATE INDEX "individuals_snils_idx" ON "individuals"("snils");
CREATE INDEX "individuals_gender_idx" ON "individuals"("gender");
CREATE INDEX "individuals_inn_idx" ON "individuals"("inn");

-- CreateIndex
CREATE INDEX "rooms_room_idx" ON "rooms"("room");
