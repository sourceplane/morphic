import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const app = path.resolve(__dirname, "../../../apps/web");
const read = (rel: string) => readFileSync(path.join(app, rel), "utf8");

describe("the product's name and origin", () => {
  it("has one name seam, the literal the rebrand rewrites", () => {
    expect(read("lib/site.ts")).toMatch(/^export const SITE_NAME = "[^"]+"$/m);
  });

  it("titles the page with it", () => {
    expect(read("app/layout.tsx")).toMatch(/const title = SITE_NAME\b/);
  });

  // Upstream's layout hard-coded its own hosted site as metadataBase, so every
  // copy's canonical and Open Graph links would have pointed there.
  it("resolves the page's links against NEXT_PUBLIC_SITE_URL, never upstream's site", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/metadataBase: new URL\(\s*process\.env\.NEXT_PUBLIC_SITE_URL \|\| 'http:\/\/localhost:3000'\s*\)/);
    expect(layout).not.toMatch(/morphic\.sh/);
  });

  it("is set by the deploy's build to this environment's Worker URL", () => {
    // Read off component.yaml itself — the worker name and subdomain are the
    // product's, whatever it is called.
    const component = read("component.yaml");
    const workerName = /^\s*workerName:\s*(\S+)\s*$/m.exec(component)?.[1];
    const subdomain = /^\s*workersDevSubdomain:\s*(\S+)\s*$/m.exec(component)?.[1];
    expect(workerName && subdomain).toBeTruthy();
    const build = /^\s*buildCommand:\s*(.+)$/m.exec(component)?.[1] ?? "";
    expect(build).toContain(
      `NEXT_PUBLIC_SITE_URL="\${SITE_URL:-https://${workerName}-\${ORUN_ENVIRONMENT}.${subdomain}.workers.dev}"`,
    );
  });
});
