-- Permite que cada utilizador altere apenas a própria preferência de virada.
GRANT UPDATE(expense_rollover_day) ON users TO finance_app;

-- Aplica a regra aos lançamentos antigos ainda sem mês de referência.
-- Valores, datas efetivas, contas, categorias e lançamentos permanecem intactos.
UPDATE transactions t
SET reference_month = (date_trunc('month', t.occurred_on) + interval '1 month')::date
FROM users u
WHERE t.user_id = u.id
  AND t.deleted_at IS NULL
  AND t.reference_month IS NULL
  AND extract(day FROM t.occurred_on) >= u.expense_rollover_day
  AND (
    t.kind IN ('expense', 'card_payment')
    OR (t.kind = 'transfer' AND t.amount > t.received)
  );
