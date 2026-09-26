CREATE TABLE future_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('income','expense')),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  cadence text NOT NULL CHECK(cadence IN ('once','monthly')),
  amount numeric(19,2) NOT NULL CHECK(amount>0 AND amount != 'NaN'::numeric),
  due_on date,
  notes text,
  is_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,plan_id) REFERENCES future_plans(user_id,id) ON DELETE CASCADE
);

CREATE INDEX future_plan_items_user_plan_idx ON future_plan_items(user_id,plan_id,kind);

INSERT INTO future_plan_items(user_id,plan_id,kind,name,cadence,amount,is_baseline)
SELECT user_id,id,'expense','Estimativa inicial','once',estimated_cost,true
FROM future_plans;

ALTER TABLE future_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE future_plan_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON future_plan_items
  USING(user_id=current_setting('app.user_id')::uuid)
  WITH CHECK(user_id=current_setting('app.user_id')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON future_plan_items TO finance_app;
