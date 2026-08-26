-- A write credential scoped to the `trace` schema.
--
-- Trace's app and its ingestion scripts need to write to their own tables, but
-- when those tables live inside the Manifund project the obvious credential —
-- Manifund's service_role key — would also grant full access to Manifund's
-- user data. This role can reach nothing but `trace`.
--
-- PostgREST assumes the role named in a request's JWT `role` claim, so Trace
-- authenticates with a token minted for trace_writer instead of service_role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trace_writer') THEN
    CREATE ROLE trace_writer NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- PostgREST connects as `authenticator` and switches roles per request.
GRANT trace_writer TO authenticator;

GRANT USAGE ON SCHEMA trace TO trace_writer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA trace TO trace_writer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA trace TO trace_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA trace GRANT ALL ON TABLES TO trace_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA trace GRANT ALL ON SEQUENCES TO trace_writer;

-- Explicitly deny everything else: no access to Manifund's own schemas.
REVOKE ALL ON SCHEMA public FROM trace_writer;
REVOKE ALL ON SCHEMA storage FROM trace_writer;

-- RLS still applies to this role, so each table needs a policy letting it
-- through — the equivalent of service_role's BYPASSRLS, but only here.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'trace'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "trace_writer full access" ON trace.%I', t
    );
    EXECUTE format(
      'CREATE POLICY "trace_writer full access" ON trace.%I FOR ALL TO trace_writer USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END
$$;
