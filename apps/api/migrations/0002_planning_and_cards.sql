CREATE TABLE recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  description text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('income','expense','transfer')),
  account_id uuid NOT NULL,
  destination_id uuid,
  category_id uuid,
  amount numeric(19,2) NOT NULL CHECK(amount>0 AND amount != 'NaN'::numeric),
  expected_day integer NOT NULL CHECK(expected_day BETWEEN 1 AND 31),
  starts_on date NOT NULL,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id),
  FOREIGN KEY(user_id,destination_id) REFERENCES accounts(user_id,id),
  FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id),
  CHECK(ends_on IS NULL OR ends_on>=starts_on),
  CHECK((kind='transfer' AND destination_id IS NOT NULL AND destination_id<>account_id AND category_id IS NULL) OR
    (kind IN ('income','expense') AND destination_id IS NULL AND category_id IS NOT NULL))
);
CREATE TABLE occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  recurrence_id uuid NOT NULL,
  due_on date NOT NULL,
  description text NOT NULL,
  kind text NOT NULL,
  account_id uuid NOT NULL,
  destination_id uuid,
  category_id uuid,
  amount numeric(19,2) NOT NULL CHECK(amount>0 AND amount != 'NaN'::numeric),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirmed','skipped')),
  transaction_id uuid,
  UNIQUE(user_id,id), UNIQUE(user_id,recurrence_id,due_on), UNIQUE(user_id,transaction_id),
  FOREIGN KEY(user_id,recurrence_id) REFERENCES recurrences(user_id,id),
  FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id),
  FOREIGN KEY(user_id,destination_id) REFERENCES accounts(user_id,id),
  FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id),
  FOREIGN KEY(user_id,transaction_id) REFERENCES transactions(user_id,id),
  CHECK((state='confirmed')=(transaction_id IS NOT NULL))
);
CREATE INDEX occurrences_user_due_idx ON occurrences(user_id,state,due_on);
CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  month date NOT NULL CHECK(extract(day FROM month)=1),
  category_id uuid NOT NULL,
  amount numeric(19,2) NOT NULL CHECK(amount>=0 AND amount != 'NaN'::numeric),
  UNIQUE(user_id,month,category_id),
  FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id)
);
CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  account_id uuid NOT NULL,
  name text NOT NULL,
  target numeric(19,2) NOT NULL CHECK(target>0 AND target != 'NaN'::numeric),
  monthly_contribution numeric(19,2) NOT NULL DEFAULT 0 CHECK(monthly_contribution>=0 AND monthly_contribution != 'NaN'::numeric),
  deadline date,
  archived boolean NOT NULL DEFAULT false,
  FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id)
);
CREATE UNIQUE INDEX goals_active_account_idx ON goals(user_id,account_id) WHERE NOT archived;
CREATE TABLE cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  closing_day integer NOT NULL CHECK(closing_day BETWEEN 1 AND 31),
  due_day integer NOT NULL CHECK(due_day BETWEEN 1 AND 31),
  archived boolean NOT NULL DEFAULT false,
  UNIQUE(user_id,id)
);
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  card_id uuid NOT NULL,
  month date NOT NULL CHECK(extract(day FROM month)=1),
  closes_on date NOT NULL,
  due_on date NOT NULL,
  payment_id uuid,
  UNIQUE(user_id,id), UNIQUE(user_id,card_id,month), UNIQUE(user_id,payment_id),
  FOREIGN KEY(user_id,card_id) REFERENCES cards(user_id,id),
  FOREIGN KEY(user_id,payment_id) REFERENCES transactions(user_id,id)
);
CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  card_id uuid NOT NULL,
  category_id uuid NOT NULL,
  description text NOT NULL,
  purchased_on date NOT NULL,
  amount numeric(19,2) NOT NULL CHECK(amount>0 AND amount != 'NaN'::numeric),
  installments integer NOT NULL CHECK(installments BETWEEN 1 AND 60),
  deleted_at timestamptz,
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,card_id) REFERENCES cards(user_id,id),
  FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id)
);
CREATE TABLE installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  purchase_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  number integer NOT NULL CHECK(number>0),
  amount numeric(19,2) NOT NULL CHECK(amount>0 AND amount != 'NaN'::numeric),
  UNIQUE(user_id,purchase_id,number),
  FOREIGN KEY(user_id,purchase_id) REFERENCES purchases(user_id,id),
  FOREIGN KEY(user_id,invoice_id) REFERENCES invoices(user_id,id)
);
CREATE INDEX invoices_user_due_idx ON invoices(user_id,due_on);
CREATE INDEX installments_invoice_idx ON installments(user_id,invoice_id);
CREATE INDEX purchases_user_date_idx ON purchases(user_id,purchased_on);
