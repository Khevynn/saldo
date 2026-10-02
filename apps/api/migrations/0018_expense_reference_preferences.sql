-- Configuração individual e mês contábil para despesas. A mudança é aditiva e preserva todos os dados.
ALTER TABLE users
  ADD COLUMN expense_rollover_day integer NOT NULL DEFAULT 25
  CHECK (expense_rollover_day BETWEEN 1 AND 31);

ALTER TABLE transactions DROP CONSTRAINT transactions_reference_month_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_reference_month_check CHECK (
  reference_month IS NULL OR (
    kind IN ('income','expense','transfer','card_payment')
    AND reference_month = date_trunc('month', reference_month)::date
  )
);

CREATE OR REPLACE VIEW cash_effects WITH (security_invoker=true) AS
  SELECT user_id,id AS transaction_id,occurred_on,category_id,kind,amount,
    coalesce(reference_month,date_trunc('month',occurred_on)::date) AS reference_month
    FROM transactions WHERE deleted_at IS NULL AND kind IN ('income','expense')
  UNION ALL
  SELECT user_id,id,occurred_on,category_id,'expense',amount-received,
    coalesce(reference_month,date_trunc('month',occurred_on)::date)
    FROM transactions WHERE deleted_at IS NULL AND kind='transfer' AND amount>received
  UNION ALL
  SELECT t.user_id,t.id,t.occurred_on,p.category_id,'expense',s.amount,
    coalesce(t.reference_month,date_trunc('month',t.occurred_on)::date)
    FROM transactions t JOIN invoices i ON i.user_id=t.user_id AND i.payment_id=t.id
    JOIN installments s ON s.user_id=i.user_id AND s.invoice_id=i.id
    JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id
    WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL;

GRANT SELECT ON cash_effects TO finance_app;
