CREATE OR REPLACE FUNCTION public.resolve_identity(p_provider text,p_subject text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved uuid;
BEGIN
  IF length(p_provider) NOT BETWEEN 1 AND 50 OR length(p_subject) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Invalid identity';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_subject,1));
  SELECT user_id INTO resolved
    FROM public.identities
    WHERE provider=p_provider AND subject=p_subject;
  IF resolved IS NOT NULL THEN
    RETURN resolved;
  END IF;
  INSERT INTO public.users DEFAULT VALUES RETURNING id INTO resolved;
  INSERT INTO public.identities(provider,subject,user_id)
    VALUES(p_provider,p_subject,resolved);
  RETURN resolved;
END $$;

REVOKE ALL ON FUNCTION public.resolve_identity(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_identity(text,text) TO finance_app;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_policy ON users;
CREATE POLICY self_policy ON users
  USING (id = nullif(current_setting('app.user_id',true),'')::uuid)
  WITH CHECK (id = nullif(current_setting('app.user_id',true),'')::uuid);

REVOKE ALL ON identities FROM finance_app;
REVOKE INSERT,UPDATE ON users FROM finance_app;
GRANT SELECT ON users TO finance_app;
GRANT UPDATE(categories_initialized) ON users TO finance_app;
GRANT DELETE ON idempotency_keys TO finance_app;

CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys(user_id,created_at);
