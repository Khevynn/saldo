-- Existing installments remain payable. Imported installments may be marked as
-- settled before the user started tracking them, without creating a cash movement.
ALTER TABLE installments
  ADD COLUMN settled_before_tracking boolean NOT NULL DEFAULT false;

