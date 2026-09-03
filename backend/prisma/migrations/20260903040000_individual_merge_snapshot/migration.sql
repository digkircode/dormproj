-- Точный слепок перенесённых при слиянии данных (id договоров/паспортов/гражданства/
-- контактов, user/chat, копия ли accounting1cContractorUid) — нужен для отмены слияния
-- (unmerge(), только ADMIN, см. individuals.controller.ts). Без него нельзя надёжно
-- понять, какие текущие данные цели принадлежали именно источнику на момент слияния.
ALTER TABLE "individuals" ADD COLUMN "merged_snapshot" JSONB;
