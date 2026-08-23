-- Одноразовый backfill роли "Проживающий" (RESIDENT) для аккаунтов, привязанных к
-- активным студентам (users.univer_id = students.fizicheskoye_litso_uid) — по прямой
-- просьбе 2026-08-23. Дальше поддерживается синхронно кодом (resident-role-sync.ts):
-- после полного синка студентов и при каждом логине через rosnou-id.
INSERT INTO users_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE r.name = 'RESIDENT'
  AND u.univer_id IS NOT NULL
  AND u.univer_id IN (SELECT fizicheskoye_litso_uid FROM students)
ON CONFLICT (user_id, role_id) DO NOTHING;
