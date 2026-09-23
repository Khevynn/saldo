-- Runtime role must not own the tables, have SUPERUSER or BYPASSRLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_app') THEN
    CREATE ROLE finance_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO finance_app;
GRANT SELECT,INSERT,UPDATE ON users,identities TO finance_app;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','transactions','recurrences','occurrences','budgets','goals','cards','invoices','purchases','installments','audit_events','idempotency_keys'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_policy ON %I USING (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid)',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO finance_app',t);
  END LOOP;
END $$;
REVOKE UPDATE ON audit_events FROM finance_app;
-- Views use the caller's permissions so RLS is enforced even through reporting.
CREATE VIEW account_effects WITH (security_invoker=true) AS
  SELECT user_id,id AS transaction_id,destination_id AS account_id,occurred_on,
    CASE WHEN kind='transfer' THEN received ELSE amount END AS amount
  FROM transactions WHERE deleted_at IS NULL AND destination_id IS NOT NULL
  UNION ALL
  SELECT user_id,id,source_id,occurred_on,-amount
  FROM transactions WHERE deleted_at IS NULL AND source_id IS NOT NULL;
CREATE VIEW cash_effects WITH (security_invoker=true) AS
  SELECT user_id,id AS transaction_id,occurred_on,category_id,kind,amount
    FROM transactions WHERE deleted_at IS NULL AND kind IN ('income','expense')
  UNION ALL
  SELECT user_id,id,occurred_on,category_id,'expense',amount-received
    FROM transactions WHERE deleted_at IS NULL AND kind='transfer' AND amount>received
  UNION ALL
  SELECT t.user_id,t.id,t.occurred_on,p.category_id,'expense',s.amount
    FROM transactions t JOIN invoices i ON i.user_id=t.user_id AND i.payment_id=t.id
    JOIN installments s ON s.user_id=i.user_id AND s.invoice_id=i.id
    JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id
    WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL;
GRANT SELECT ON account_effects,cash_effects TO finance_app;
