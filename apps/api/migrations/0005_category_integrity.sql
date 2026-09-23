-- Enforce category kind in the database as well as in the HTTP validation layer.
ALTER TABLE recurrences ADD CONSTRAINT recurrence_category_kind_fk
  FOREIGN KEY(user_id,category_id,kind) REFERENCES categories(user_id,id,kind);
ALTER TABLE occurrences ADD CONSTRAINT occurrence_category_kind_fk
  FOREIGN KEY(user_id,category_id,kind) REFERENCES categories(user_id,id,kind);
ALTER TABLE budgets ADD COLUMN category_kind text GENERATED ALWAYS AS ('expense'::text) STORED;
ALTER TABLE budgets ADD CONSTRAINT budget_expense_category_fk
  FOREIGN KEY(user_id,category_id,category_kind) REFERENCES categories(user_id,id,kind);
ALTER TABLE purchases ADD COLUMN category_kind text GENERATED ALWAYS AS ('expense'::text) STORED;
ALTER TABLE purchases ADD CONSTRAINT purchase_expense_category_fk
  FOREIGN KEY(user_id,category_id,category_kind) REFERENCES categories(user_id,id,kind);
