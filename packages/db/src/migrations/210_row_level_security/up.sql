-- Supabase's Data API shut out of every table in `public`.
--
-- Supabase's Data API (PostgREST) serves `public` to anyone holding the
-- project's anon key, which is public by Supabase's design, as the roles
-- `anon` and `authenticated` — and Supabase grants both of them every
-- privilege on what the `postgres` role creates there. Upstream assumed a
-- private Postgres reached by a restricted `app_user`: its migrations enable
-- row-level security on the chat tables with policies written `TO public`
-- (every role, the Data API's included) — public chats and their messages
-- readable, feedback readable and insertable — and leave other tables,
-- Better Auth's among them, without RLS at all. Through the Data API that
-- would hand out accounts, sessions and every chat anyone made public.
--
-- So, on every table in `public`: row-level security enabled, and every
-- privilege `anon` and `authenticated` hold revoked — on the tables and
-- their sequences, and on what `postgres` creates here later (the schema has
-- no functions for the Data API to call). A policy written `TO public` grants nothing to a role that holds no
-- privilege on the table. The app is not affected: it connects through
-- Hyperdrive as `postgres` (the cloudflare-hyperdrive root's database_user),
-- which created and owns these tables, and a table's owner is not subject to
-- its RLS unless FORCE is set (it is not). The migration ledgers
-- (`_migrations`, drizzle-kit's `drizzle`) and `app_private` are schemas the
-- Data API does not expose. tests/db fails if any table in `public` is left
-- without RLS, or with a privilege for either role, after the migrations.
--
-- FIRST, the guard. If `postgres` neither owns every table here nor has
-- SUPERUSER or BYPASSRLS, enabling RLS would lock the app out of its own
-- data: stop. The guard changes nothing and runs before the first ALTER, so
-- a refusal enables nothing. Idempotent: ENABLE on an enabled table and a
-- REVOKE of a privilege not held are no-ops.
DO $$
DECLARE
  app_bypasses boolean;
  not_owned text;
BEGIN
  SELECT rolsuper OR rolbypassrls INTO app_bypasses FROM pg_roles WHERE rolname = 'postgres';
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO not_owned
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND pg_get_userbyid(c.relowner) <> 'postgres';
  IF NOT coalesce(app_bypasses, false) AND not_owned IS NOT NULL THEN
    RAISE EXCEPTION 'row-level security would lock the app out of %: postgres (the role Hyperdrive connects as) neither owns them nor has SUPERUSER or BYPASSRLS', not_owned;
  END IF;
END
$$;

DO $$
DECLARE
  t record;
  role_name text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
