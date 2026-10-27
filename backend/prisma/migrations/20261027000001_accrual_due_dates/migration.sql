UPDATE "accruals" AS a
SET "due_date" = a."period_start"
FROM "contracts" AS c
WHERE a."contract_id" = c."id"
  AND a."voided_at" IS NULL
  AND a."period_start" = c."start_date"
  AND a."due_date" < a."period_start"
  AND NOT (
    c."mat_capital_covered_from" IS NOT NULL
    AND c."mat_capital_covered_to" IS NOT NULL
    AND c."mat_capital_deferred_until" IS NOT NULL
    AND a."period_start" >= c."mat_capital_covered_from"
    AND a."period_start" <= c."mat_capital_covered_to"
  );
