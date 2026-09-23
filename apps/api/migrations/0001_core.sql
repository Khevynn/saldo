CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identities (
  provider text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(provider, subject)
);
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  nature text NOT NULL CHECK (nature IN ('bank','cash','benefit','pot','other')),
  purpose text NOT NULL CHECK (purpose IN ('available','restricted','reserved')),
  opening_balance numeric(19,2) NOT NULL CHECK (opening_balance != 'NaN'::numeric),
  opening_date date NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id)
);
CREATE INDEX accounts_user_idx ON accounts(user_id);
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  archived boolean NOT NULL DEFAULT false,
  UNIQUE(user_id,id), UNIQUE(user_id,kind,name), UNIQUE(user_id,id,kind)
);
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('income','expense','transfer','card_payment')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  source_id uuid,
  destination_id uuid,
  amount numeric(19,2) NOT NULL CHECK (amount > 0 AND amount != 'NaN'::numeric),
  received numeric(19,2),
  category_id uuid,
  category_kind text,
  occurred_on date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,source_id) REFERENCES accounts(user_id,id),
  FOREIGN KEY(user_id,destination_id) REFERENCES accounts(user_id,id),
  FOREIGN KEY(user_id,category_id,category_kind) REFERENCES categories(user_id,id,kind),
  CHECK (
    (kind='income' AND source_id IS NULL AND destination_id IS NOT NULL AND received IS NULL AND category_id IS NOT NULL AND category_kind='income') OR
    (kind='expense' AND source_id IS NOT NULL AND destination_id IS NULL AND received IS NULL AND category_id IS NOT NULL AND category_kind='expense') OR
    (kind='transfer' AND source_id IS NOT NULL AND destination_id IS NOT NULL AND source_id<>destination_id
      AND received IS NOT NULL AND received>0 AND received<=amount AND received != 'NaN'::numeric
      AND ((received=amount AND category_id IS NULL AND category_kind IS NULL) OR (received<amount AND category_id IS NOT NULL AND category_kind='expense'))) OR
    (kind='card_payment' AND source_id IS NOT NULL AND destination_id IS NULL AND received IS NULL AND category_id IS NULL AND category_kind IS NULL)
  )
);
CREATE INDEX transactions_user_date_idx ON transactions(user_id,occurred_on DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX transactions_source_idx ON transactions(user_id,source_id,occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX transactions_destination_idx ON transactions(user_id,destination_id,occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX transactions_category_idx ON transactions(user_id,category_id,occurred_on) WHERE deleted_at IS NULL;
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_date_idx ON audit_events(user_id,created_at DESC);
CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL REFERENCES users(id),
  key uuid NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,key)
);
