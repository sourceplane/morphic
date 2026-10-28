import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// tooling/wire/worker-secrets.mjs: what hands the owner's model and search
// keys to the Worker on a deploy, and to wrangler dev locally. Run as the
// deploy runs it, with made-up values, and never with a Cloudflare credential.
const SCRIPT = path.resolve(__dirname, "../../../tooling/wire/worker-secrets.mjs");
const SECRET = "sk-test-offline-fixture-not-a-key";
const SEARCH = "tvly-offline-fixture-not-a-key";

function run(args: string[], env: Record<string, string | undefined>) {
  const clean = { ...process.env };
  delete clean.CLOUDFLARE_API_TOKEN;
  delete clean.OPENAI_API_KEY;
  delete clean.TAVILY_API_KEY;
  return spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...clean, ...env }, encoding: "utf8" });
}

describe("worker-secrets.mjs", () => {
  it("skips an unset secret and succeeds: the build without it needs none", () => {
    const r = run(["--secret", "OPENAI_API_KEY", "--worker", "acme-web-stage"], {});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("not set, skipped: OPENAI_API_KEY");
    expect(r.stdout).toContain("nothing to set");
  });

  it("pushes nothing from a verify lane (no Cloudflare credential), and prints no value", () => {
    const r = run(["--secret", "OPENAI_API_KEY", "--secret", "TAVILY_API_KEY", "--worker", "acme-web-stage"], {
      OPENAI_API_KEY: SECRET,
      TAVILY_API_KEY: SEARCH,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("a verify lane");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
    expect(r.stdout + r.stderr).not.toContain(SEARCH);
  });

  it("writes .dev.vars for wrangler dev, readable by its owner only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-secrets-"));
    const file = path.join(dir, ".dev.vars");
    const r = run(["--secret", "OPENAI_API_KEY", "--secret", "TAVILY_API_KEY", "--dev-vars", file], {
      OPENAI_API_KEY: SECRET,
    });
    expect(r.status).toBe(0);
    // Only what is set: the unset one is named, not written.
    expect(fs.readFileSync(file, "utf8")).toBe(`OPENAI_API_KEY="${SECRET}"\n`);
    expect(r.stdout).toContain("not set, skipped: TAVILY_API_KEY");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(r.stdout + r.stderr).not.toContain(SECRET);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a name that is not an environment variable", () => {
    const r = run(["--secret", "openai-api-key", "--worker", "acme-web-stage"], {});
    expect(r.status).toBe(2);
  });
});
