import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import { buildPlan, runMigrations } from "@saas/db/runner";

const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const drizzleDir = path.resolve(__dirname, "../../../apps/web/drizzle");

type Journal = { entries: { idx: number; tag: string }[] };
const journal = JSON.parse(readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as Journal;

describe("the migration manifest (packages/db)", () => {
  it("starts with the control migration and names every file with its checksum", () => {
    expect(manifest.migrations[0]?.id).toBe("000_control_baseline");
    for (const entry of manifest.migrations) {
      const file = readFileSync(path.join(migrationsDir, entry.path));
      expect(createHash("sha256").update(file).digest("hex"), entry.id).toBe(entry.checksum);
    }
  });

  it("plans every migration as pending offline", async () => {
    const result = await runMigrations(manifest, { mode: "plan", migrationsDir, adapter: null });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(manifest.migrations.map((m) => m.id));
  });

  // db-migrate applies packages/db's copy to stage and prod; drizzle-kit
  // (`pnpm --filter @app/web migrate`) applies apps/web/drizzle, in its
  // journal's order, to a local database. They must be the same files, in
  // the same order, byte for byte.
  it("gives every app migration, in order, a byte-identical drizzle-kit twin", () => {
    const app = manifest.migrations.filter((m) => m.context === "app");
    // Upstream's 0000–0020 are packages/db's 100–120; this baseline's two
    // (journal 0021, 0022) are 200 and 210.
    const dirOf = (e: { idx: number; tag: string }) =>
      `${e.idx <= 20 ? 100 + e.idx : 200 + (e.idx - 21) * 10}_${e.tag.slice(5)}/up.sql`;
    expect(app.map((m) => m.path)).toEqual(journal.entries.map(dirOf));
    for (const [i, entry] of app.entries()) {
      const ours = readFileSync(path.join(migrationsDir, entry.path));
      const twin = readFileSync(path.join(drizzleDir, `${journal.entries[i]!.tag}.sql`));
      expect(ours.equals(twin), entry.id).toBe(true);
    }
  });

  it("carries upstream's twenty-one migrations unchanged, then this baseline's two", () => {
    const app = manifest.migrations.filter((m) => m.context === "app").map((m) => m.id);
    expect(app).toHaveLength(23);
    expect(app[0]).toBe("100_black_lifeguard");
    expect(app[20]).toBe("120_add_parts_search_fts");
    expect(app.slice(21)).toEqual(["200_app_secrets", "210_row_level_security"]);
  });

  it("skips what the database already recorded", () => {
    const applied = new Map([[manifest.migrations[0]!.id, manifest.migrations[0]!.checksum]]);
    const plan = buildPlan(manifest, applied, migrationsDir);
    expect(plan.alreadyApplied).toEqual([manifest.migrations[0]!.id]);
    expect(plan.pending.map((m) => m.id)).toEqual(manifest.migrations.slice(1).map((m) => m.id));
    expect(plan.checksumMismatches).toEqual([]);
  });
});
