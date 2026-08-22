-- Гражданство ручного ввода на individuals (форма "Новое физическое лицо") — nullable,
-- для синхронизируемых из 1С физлиц остаётся null (у них гражданство через citizenships).

ALTER TABLE "individuals" ADD COLUMN "citizenship" TEXT;
