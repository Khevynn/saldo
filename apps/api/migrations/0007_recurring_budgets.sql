-- A recurring budget is the default for a category from a given month onward.
-- Existing rows in budgets remain month-specific overrides, preserving history.
CREATE TABLE budget_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  category_id uuid NOT NULL,
  amount numeric(19,2) NOT NULL CHECK(amount>=0 AND amount != 'NaN'::numeric),
  starts_month date NOT NULL CHECK(extract(day FROM starts_month)=1),
  ends_month date CHECK(ends_month IS NULL OR (extract(day FROM ends_month)=1 AND ends_month>=starts_month)),
  category_kind text GENERATED ALWAYS AS ('expense'::text) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  UNIQUE(user_id,category_id,starts_month),
  FOREIGN KEY(user_id,category_id,category_kind) REFERENCES categories(user_id,id,kind)
);
CREATE INDEX budget_rules_lookup_idx
  ON budget_rules(user_id,category_id,starts_month DESC,ends_month);
ALTER TABLE budget_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON budget_rules
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON budget_rules TO finance_app;
GRANT DELETE ON budgets TO finance_app;
