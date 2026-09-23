ALTER TABLE transactions ADD CONSTRAINT category_kind_required CHECK(category_id IS NULL OR category_kind IS NOT NULL);
ALTER TABLE occurrences ADD CONSTRAINT occurrence_kind CHECK(kind IN ('income','expense','transfer'));
ALTER TABLE occurrences ADD CONSTRAINT occurrence_shape CHECK(
  (kind='transfer' AND destination_id IS NOT NULL AND destination_id<>account_id AND category_id IS NULL) OR
  (kind IN ('income','expense') AND destination_id IS NULL AND category_id IS NOT NULL)
);
