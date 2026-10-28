import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/db/index.ts: upstream exported one module-level `db`; on Workers a
// socket cannot outlive its request, so `db` is a proxy onto a client built
// per request from the HYPERDRIVE binding's connection string — the same
// client for the whole of one request, a new one for the next — and onto
// upstream's DATABASE_URL client when there is no Cloudflare context.
// The app's own drizzle runs over a stand-in `postgres` client (drizzle-orm
// resolves from apps/web, past any mock of it here); drizzle hands the client
// back as `$client`.
const postgres = vi.fn((connectionString: string, options: Record<string, unknown>) => ({
  connectionString,
  passed: options,
  options: { ...options, parsers: {}, serializers: {} },
}));
vi.mock("postgres", () => ({ default: (...args: [string, Record<string, unknown>]) => postgres(...args) }));
const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContext(...args),
}));

type Probe = { $client: { connectionString: string; passed: unknown }; select: unknown };
const hyperdriveOptions = { max: 5, fetch_types: false, prepare: false };
const inRequest = (ctx: object) =>
  getCloudflareContext.mockReturnValue({
    env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive/db" } },
    ctx,
  });

describe("db (apps/web/lib/db/index.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    postgres.mockClear();
    getCloudflareContext.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("connects through the HYPERDRIVE binding inside a Worker request, with Hyperdrive's options", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://should-not-be-used");
    inRequest({});
    const { db } = await import("@/lib/db");
    const probe = db as unknown as Probe;
    expect(probe.$client.connectionString).toBe("postgres://hyperdrive/db");
    expect(probe.$client.passed).toEqual(hyperdriveOptions);
    expect(typeof probe.select).toBe("function");
  });

  it("builds one client per request and a new one for the next", async () => {
    const { db } = await import("@/lib/db");
    const probe = db as unknown as Probe;
    inRequest({ request: 1 });
    void probe.$client;
    void probe.$client;
    expect(postgres).toHaveBeenCalledTimes(1);
    inRequest({ request: 2 });
    void probe.$client;
    expect(postgres).toHaveBeenCalledTimes(2);
  });

  it("is upstream's DATABASE_URL client without a Cloudflare context", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/morphic");
    getCloudflareContext.mockImplementation(() => {
      throw new Error("not in a Worker request");
    });
    const { db } = await import("@/lib/db");
    const probe = db as unknown as Probe;
    expect(probe.$client.connectionString).toBe("postgres://postgres:postgres@localhost:5432/morphic");
    void probe.$client;
    // Upstream's single pool, opened once.
    expect(postgres).toHaveBeenCalledTimes(1);
  });

  it("throws on use, not on import, with neither", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DATABASE_RESTRICTED_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    getCloudflareContext.mockImplementation(() => {
      throw new Error("not in a Worker request");
    });
    const { db } = await import("@/lib/db");
    expect(() => (db as unknown as Probe).$client).toThrow(/HYPERDRIVE binding/);
    expect(postgres).not.toHaveBeenCalled();
  });
});
