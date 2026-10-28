import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// apps/web's wrangler.jsonc is COMMITTED: the composition checks that it
// exists before the build, in a fresh checkout, so it cannot be a file a build
// generates. It is the render of wrangler.template.jsonc from
// wiring.fixture.json, and the stage and prod deploy lanes re-render it from
// their live wiring document (apps/web/component.yaml's buildCommand). These
// hold the committed file to the template, the live render to the document it
// is given, and both to the one binding the app needs and the configuration
// it ships with.
const app = path.resolve(__dirname, "../../../apps/web");
const wire = path.resolve(__dirname, "../../../tooling/wire");

function renderFixture(env: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "wire-"));
  try {
    const out = path.join(dir, "wrangler.jsonc");
    execFileSync(process.execPath, [
      path.join(wire, "render.mjs"),
      "--template", path.join(app, "wrangler.template.jsonc"),
      "--out", out,
      "--map", path.join(app, "wiring.fixture.json"),
      "--env", env,
    ]);
    return readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// JSONC → JSON: wrangler's comments are whole lines or trail a value, and no
// string in these files contains `//`.
function parse(jsonc: string): Record<string, unknown> {
  const json = jsonc
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
  return JSON.parse(json);
}

describe("apps/web wrangler config", () => {
  it("is committed as the fixture render of the template (pnpm run wire:fixture)", () => {
    expect(readFileSync(path.join(app, "wrangler.jsonc"), "utf8")).toBe(renderFixture("stage"));
  });

  it("keeps every resource id in the template a wiring token", () => {
    const template = readFileSync(path.join(app, "wrangler.template.jsonc"), "utf8");
    expect(template).not.toMatch(/"id":\s*"[0-9a-f]{32}"/);
    expect(template).toMatch(/@@wiring\(cloudflare-hyperdrive\/__ENV__:hyperdrive_id\)@@/);
  });

  it("binds the database as HYPERDRIVE and nothing a model needs", () => {
    const config = parse(readFileSync(path.join(app, "wrangler.jsonc"), "utf8"));
    expect(config.hyperdrive).toEqual([expect.objectContaining({ binding: "HYPERDRIVE" })]);
    // The models are vendor APIs reached with the owner's keys.
    expect(config.ai).toBeUndefined();
    expect(config.compatibility_flags).toEqual(expect.arrayContaining(["nodejs_compat", "global_fetch_strictly_public"]));
  });

  it("ships Better Auth with invite-only sign-up, and no secret as a var", () => {
    const config = parse(readFileSync(path.join(app, "wrangler.jsonc"), "utf8"));
    expect(config.vars).toEqual({ AUTH_PROVIDER: "better-auth", AUTH_SIGNUP_MODE: "invite" });
    for (const name of Object.keys((config.vars ?? {}) as Record<string, unknown>)) {
      expect(name).not.toMatch(/KEY|SECRET|TOKEN|PASSWORD|ADMIN_EMAIL/);
    }
  });

  it("renders a deploy lane its own environment from the live wiring document", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wire-"));
    try {
      const out = path.join(dir, "wrangler.jsonc");
      execFileSync(
        process.execPath,
        [
          path.join(wire, "live.mjs"),
          "--template", path.join(app, "wrangler.template.jsonc"),
          "--out", out,
          "--components", "cloudflare-hyperdrive",
          "--env", "prod",
        ],
        {
          env: {
            ...process.env,
            WIRING_CLOUDFLARE_HYPERDRIVE_PROD: JSON.stringify({
              hyperdrive_id: "f".repeat(32),
              hyperdrive_name: "prod-x-prod",
            }),
          },
        },
      );
      const rendered = readFileSync(out, "utf8");
      expect(rendered).toContain(`"id": "${"f".repeat(32)}"`);
      expect(rendered).not.toContain("__ENV__");
      expect(parse(rendered).hyperdrive).toEqual([expect.objectContaining({ id: "f".repeat(32) })]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a deploy render with no wiring document", () => {
    const env = { ...process.env };
    delete env.WIRING_CLOUDFLARE_HYPERDRIVE_STAGE;
    expect(() =>
      execFileSync(
        process.execPath,
        [
          path.join(wire, "live.mjs"),
          "--template", path.join(app, "wrangler.template.jsonc"),
          "--out", path.join(tmpdir(), "never-written.jsonc"),
          "--components", "cloudflare-hyperdrive",
          "--env", "stage",
        ],
        { env, stdio: "pipe" },
      ),
    ).toThrow();
  });
});
