import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

// apps/web/component.yaml: the owner's keys are optional Orun secrets, kept
// out of the build and handed to the Worker after it. The three places that
// name them must name the same ones.
const component = readFileSync(path.resolve(__dirname, "../../../apps/web/component.yaml"), "utf8");
const build = /^\s*buildCommand:\s*(.+)$/m.exec(component)?.[1] ?? "";

function optionalSecrets(): string[] {
  const block = /^ {2}optionalSecretEnv:\n((?: {4}\S.*\n)+)/m.exec(component)?.[1] ?? "";
  return [...block.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!).sort();
}

describe("the owner's keys (apps/web/component.yaml)", () => {
  it("are optional Orun secrets of this product, per environment", () => {
    const names = optionalSecrets();
    expect(names).toEqual(
      [
        "ANTHROPIC_API_KEY",
        "BOOTSTRAP_ADMIN_EMAIL",
        "BRAVE_SEARCH_API_KEY",
        "EXA_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "OPENAI_API_KEY",
        "TAVILY_API_KEY",
      ].sort(),
    );
    for (const name of names) {
      expect(component).toMatch(new RegExp(`^ {4}${name}: "secret://[^/]+/[^/]+/\\{\\{ \\.environment \\}\\}/${name}"$`, "m"));
    }
    // Never required: a fresh product has none of them.
    expect(/^ {2}secretEnv:\n((?: {4}\S.*\n)+)/m.exec(component)?.[1]).not.toMatch(/API_KEY|ADMIN_EMAIL/);
  });

  it("are unset for the build and every one is handed to the Worker after it", () => {
    const [beforeBuild, afterBuild] = build.split("pnpm exec turbo run build --filter=@app/web");
    expect(afterBuild).toBeDefined();
    const unset = [...beforeBuild!.matchAll(/-u ([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]).sort();
    const pushed = [...afterBuild!.matchAll(/--secret ([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]).sort();
    expect(unset).toEqual(optionalSecrets());
    expect(pushed).toEqual(optionalSecrets());
    expect(afterBuild).toContain("tooling/wire/worker-secrets.mjs");
  });
});
