ALTER TABLE recurrences
  ADD COLUMN interval_months integer NOT NULL DEFAULT 1
  CHECK(interval_months BETWEEN 1 AND 24);

CREATE TABLE future_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  theme text NOT NULL CHECK(theme IN ('move','travel','education','purchase','project','other')),
  target_date date NOT NULL,
  estimated_cost numeric(19,2) NOT NULL CHECK(estimated_cost>0 AND estimated_cost != 'NaN'::numeric),
  reserved_amount numeric(19,2) NOT NULL DEFAULT 0 CHECK(reserved_amount>=0 AND reserved_amount != 'NaN'::numeric),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id)
);

CREATE INDEX future_plans_user_status_date_idx
  ON future_plans(user_id,status,target_date);

ALTER TABLE future_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE future_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON future_plans
  USING(user_id=current_setting('app.user_id')::uuid)
  WITH CHECK(user_id=current_setting('app.user_id')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON future_plans TO finance_app;
