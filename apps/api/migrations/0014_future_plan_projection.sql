CREATE TABLE future_plan_pockets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK(kind IN ('principal','benefit','reserve')),
  opening_balance numeric(19,2) NOT NULL DEFAULT 0 CHECK(opening_balance>=0 AND opening_balance != 'NaN'::numeric),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  UNIQUE(user_id,plan_id,name),
  FOREIGN KEY(user_id,plan_id) REFERENCES future_plans(user_id,id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX future_plan_pockets_principal_idx
  ON future_plan_pockets(user_id,plan_id) WHERE kind='principal';

INSERT INTO future_plan_pockets(user_id,plan_id,name,kind,opening_balance)
SELECT user_id,id,'Principal','principal',reserved_amount FROM future_plans;

ALTER TABLE future_plan_items
  DROP CONSTRAINT future_plan_items_cadence_check;
UPDATE future_plan_items SET cadence='recurring' WHERE cadence='monthly';
ALTER TABLE future_plan_items
  ADD CONSTRAINT future_plan_items_cadence_check CHECK(cadence IN ('once','recurring')),
  ADD COLUMN interval_months integer NOT NULL DEFAULT 1 CHECK(interval_months BETWEEN 1 AND 60),
  ADD COLUMN pocket_id uuid;

UPDATE future_plan_items item
SET pocket_id=pocket.id
FROM future_plan_pockets pocket
WHERE pocket.user_id=item.user_id AND pocket.plan_id=item.plan_id AND pocket.kind='principal';

ALTER TABLE future_plan_items
  ALTER COLUMN pocket_id SET NOT NULL,
  ADD FOREIGN KEY(user_id,pocket_id) REFERENCES future_plan_pockets(user_id,id);

CREATE INDEX future_plan_items_pocket_idx ON future_plan_items(user_id,pocket_id);

ALTER TABLE future_plan_pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE future_plan_pockets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON future_plan_pockets
  USING(user_id=current_setting('app.user_id')::uuid)
  WITH CHECK(user_id=current_setting('app.user_id')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON future_plan_pockets TO finance_app;
