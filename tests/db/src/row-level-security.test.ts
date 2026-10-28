import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";

// Supabase's Data API (PostgREST) serves the `public` schema to anyone holding
// the project's anon key, as the roles `anon` and `authenticated` — and a
// Supabase project grants both every privilege on what `postgres` creates
// there, by default privileges set BEFORE any migration runs. Upstream's
// policies are written `TO public`, so without migration 210 those roles
// would read every public chat and all feedback through it. These run every
// migration db-migrate applies, in the manifest's order, on a real Postgres in
// process (PGlite: Postgres compiled to WASM) set up the way a Supabase
// project is, and read what it leaves.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const sqlOf = (rel: string) => readFileSync(path.join(migrationsDir, rel), "utf8");

const DATA_API_ROLES = ["anon", "authenticated"] as const;

// What a Supabase project has before its first migration: the Data API's
// roles, and Supabase's default grants to them on what `postgres` creates.
async function supabaseLike(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    grant usage on schema public to anon, authenticated;
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;`);
  return db;
}

async function migrated(only?: (id: string) => boolean): Promise<PGlite> {
  const db = await supabaseLike();
  for (const entry of manifest.migrations.filter((m) => (only ? only(m.id) : true))) {
    await db.exec(sqlOf(entry.path));
  }
  return db;
}

type Rel = { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean };
const PUBLIC_TABLES = `
  select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
   order by c.relname`;

// Every table upstream's migrations create, Better Auth's included.
const UPSTREAM_TABLES = [
  "account",
  "additional_usage_interest",
  "chats",
  "feedback",
  "files",
  "invitations",
  "messages",
  "notes",
  "parts",
  "session",
  "usage_events",
  "usage_grants",
  "user",
  "verification",
];

describe("the Data API shut out of public (after every migration)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await migrated();
  }, 120_000);

  it("leaves no table in public without row-level security, and forces none", async () => {
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    // Not vacuous: upstream's tables are all there.
    expect(rows.map((r) => r.relname)).toEqual(expect.arrayContaining(UPSTREAM_TABLES));
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
    // The owner — the app's role — is never subject to it.
    expect(rows.filter((r) => r.relforcerowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("leaves anon and authenticated no privilege on any table or sequence in public", async () => {
    for (const role of DATA_API_ROLES) {
      const tables = await db.query<{ table_name: string; privilege_type: string }>(
        `select table_name, privilege_type from information_schema.role_table_grants
          where grantee = $1 and table_schema = 'public'`,
        [role],
      );
      expect(tables.rows, role).toEqual([]);
      const sequences = await db.query<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'S'
            and (has_sequence_privilege($1, c.oid, 'USAGE') or has_sequence_privilege($1, c.oid, 'SELECT'))`,
        [role],
      );
      expect(sequences.rows, role).toEqual([]);
    }
  });

  it("refuses every read and the writes upstream's policies would allow, as either role", async () => {
    // Rows the owner wrote, which upstream's `TO public` policies would show:
    // a public chat, and feedback (readable by anyone).
    await db.exec(`
      insert into chats (id, title, user_id, visibility) values ('c1', 'shared', 'u1', 'public');
      insert into feedback (id, sentiment, message, page_url) values ('f1', 'positive', 'owner row', '/');`);
    for (const role of DATA_API_ROLES) {
      await db.exec(`set role ${role}`);
      try {
        for (const table of UPSTREAM_TABLES) {
          await expect(db.query(`select count(*) from "${table}"`), `${role} reads ${table}`).rejects.toThrow(
            /permission denied/,
          );
        }
        await expect(
          db.exec("insert into feedback (id, sentiment, message, page_url) values ('anon', 'negative', 'x', '/')"),
          `${role} writes feedback`,
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.exec("insert into chats (id, title, user_id, visibility) values ('anon', 'x', 'anon', 'public')"),
          `${role} writes chats`,
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    }
    // The owner — the role the app connects as — keeps everything.
    const owner = await db.query<{ n: number }>("select count(*)::int as n from chats where visibility = 'public'");
    expect(owner.rows[0]!.n).toBe(1);
  });

  it("gives the Data API nothing on a table the app creates later", async () => {
    await db.exec("create table public.later_table (id text primary key)");
    for (const role of DATA_API_ROLES) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_table_privilege($1, 'public.later_table', 'SELECT') as ok",
        [role],
      );
      expect(rows[0]!.ok, role).toBe(false);
    }
  });
});

describe("migration 200: the generated Better Auth key", () => {
  it("is 64 hex characters, kept out of public, and kept on a re-run", async () => {
    const db = await migrated();
    const first = await db.query<{ value: string }>(
      "select value from app_private.secrets where name = 'better_auth_secret'",
    );
    expect(first.rows[0]!.value).toMatch(/^[0-9a-f]{64}$/);
    await db.exec(sqlOf("200_app_secrets/up.sql"));
    const again = await db.query<{ value: string }>(
      "select value from app_private.secrets where name = 'better_auth_secret'",
    );
    expect(again.rows[0]!.value).toBe(first.rows[0]!.value);
    for (const role of DATA_API_ROLES) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_table_privilege($1, 'app_private.secrets', 'SELECT') as ok",
        [role],
      );
      expect(rows[0]!.ok, role).toBe(false);
    }
  }, 120_000);

  it("draws a different key for every database", async () => {
    const [a, b] = await Promise.all([migrated(), migrated()]);
    const read = async (db: PGlite) =>
      (await db.query<{ value: string }>("select value from app_private.secrets where name = 'better_auth_secret'"))
        .rows[0]!.value;
    expect(await read(a)).not.toBe(await read(b));
  }, 120_000);
});

describe("migration 210", () => {
  it("is a no-op on a re-run", async () => {
    const db = await migrated();
    await db.exec(sqlOf("210_row_level_security/up.sql"));
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  }, 120_000);

  it("runs on a plain Postgres with no Data API roles (a local database)", async () => {
    const db = new PGlite();
    for (const entry of manifest.migrations) {
      await db.exec(sqlOf(entry.path));
    }
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  }, 120_000);

  // The guard names `postgres`, the role Hyperdrive connects as, which PGlite
  // cannot take SUPERUSER from. Pointed instead at a role that neither owns the
  // tables nor bypasses RLS, it must refuse — and change nothing.
  const migration = sqlOf("210_row_level_security/up.sql");
  const aimedAt = (role: string) =>
    migration.replaceAll("rolname = 'postgres'", `rolname = '${role}'`).replaceAll("<> 'postgres'", `<> '${role}'`);
  const beforeShutOut = () => migrated((id) => id < "210");

  it("refuses when the app's role would be locked out, changing nothing", async () => {
    const db = await beforeShutOut();
    const before = await db.query<Rel>(PUBLIC_TABLES);
    await db.exec("create role app_without_bypass nologin");
    await expect(db.exec(aimedAt("app_without_bypass"))).rejects.toThrow(/would lock the app out/);
    const after = await db.query<Rel>(PUBLIC_TABLES);
    expect(after.rows).toEqual(before.rows);
    const grants = await db.query<{ n: number }>(
      "select count(*)::int as n from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'",
    );
    expect(grants.rows[0]!.n).toBeGreaterThan(0);
  }, 120_000);

  it("passes for a role with BYPASSRLS", async () => {
    const db = await beforeShutOut();
    await db.exec("create role app_with_bypass nologin bypassrls");
    await db.exec(aimedAt("app_with_bypass"));
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  }, 120_000);
});
