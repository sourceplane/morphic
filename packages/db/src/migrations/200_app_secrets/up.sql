-- Values the app needs that no platform brokers and no owner has set yet,
-- generated inside the environment's own database. Upstream asked whoever
-- runs the container for BETTER_AUTH_SECRET; a product built from this
-- baseline is born with one instead (apps/web/lib/auth/better-auth/config.ts
-- reads it, and a BETTER_AUTH_SECRET Worker secret wins once an owner sets
-- one). Kept out of `public`, which Supabase's Data API exposes.
--
-- Idempotent: a re-run keeps the key the environment already signs with —
-- replacing it would sign every user out.

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.secrets (
  name       TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Better Auth's signing key: 64 hex characters from two v4 UUIDs, which
-- gen_random_uuid() draws from pg_strong_random.
INSERT INTO app_private.secrets (name, value)
VALUES ('better_auth_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;
