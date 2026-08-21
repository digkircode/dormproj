-- Первый этап ролевой модели: справочник ролей + junction на users (не enum-колонка —
-- под будущие несколько ролей на аккаунт), плюс сид 3 фиксированных ролей и бутстрап
-- ADMIN для двух аккаунтов, названных пользователем напрямую (858, 818) — оба уже
-- существуют в users на момент миграции (проверено вручную перед созданием). Без
-- бутстрапа первый Администратор не смог бы назначить роль вообще никому, включая себя.

CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

CREATE TABLE "users_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "users_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);

ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "roles" ("name") VALUES ('ADMIN'), ('STAFF'), ('RESIDENT');

INSERT INTO "users_roles" ("user_id", "role_id")
SELECT u.id, r.id FROM "users" u, "roles" r WHERE u.id IN (858, 818) AND r.name = 'ADMIN';
