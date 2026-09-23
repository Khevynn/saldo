ALTER TABLE users ADD COLUMN categories_initialized boolean NOT NULL DEFAULT false;
UPDATE users u SET categories_initialized=true
WHERE EXISTS(SELECT 1 FROM categories c WHERE c.user_id=u.id);
