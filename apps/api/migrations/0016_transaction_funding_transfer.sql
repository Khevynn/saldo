-- Optional informational link between an expense and the transfer that funded it.
-- Existing transactions remain unchanged and calculations continue to use cash effects.
ALTER TABLE transactions
  ADD COLUMN funding_transfer_id uuid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_funding_transfer_kind_check CHECK (
    funding_transfer_id IS NULL OR kind = 'expense'
  ),
  ADD CONSTRAINT transactions_funding_transfer_fk FOREIGN KEY (user_id, funding_transfer_id)
    REFERENCES transactions(user_id, id);

CREATE INDEX transactions_funding_transfer_idx
  ON transactions(user_id, funding_transfer_id)
  WHERE funding_transfer_id IS NOT NULL;
