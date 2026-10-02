ALTER TABLE recurrences
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS recurrences_user_visible_idx
  ON recurrences(user_id, description)
  WHERE deleted_at IS NULL;
