# morphic — implementation status

| Milestone | State | Landed |
|---|---|---|
| MO0 — the spec | ✅ | MO-1 |
| MO1 — the answer engine on Workers and Supabase | ✅ | MO-2 |
| MO2 — a baseline | ✅ | MO-3, tagged `baseline-v1` |

## Departures from the upstream template

Everything not listed here is the template as it is at `92224b0`.

| # | What | Why |
|---|---|---|
| 1 | The app lives in `apps/web` of a pnpm workspace, Bun → pnpm; every top-level dependency pinned to the version upstream's `bun.lock` resolved; imports Bun hoisted for it declared (`@ai-sdk/provider-utils`, `@radix-ui/react-visually-hidden`), and `@opentelemetry/exporter-trace-otlp-http` at bun.lock's 0.220.0 (left to float, pnpm resolves 0.300.0 for Langfuse, which needs a newer `@opentelemetry/api` than upstream's 1.9.0) | The reference's shape; the template as tested |
| 2 | Next.js 16.2.6 → 16.3.8, eslint-config-next 16.2.3 → 16.3.8, with `react-hooks/set-state-in-effect` (new in 16.3) off | 16.3.8 is OpenNext's floor; the rule flags the template's code in eleven places, kept as written |
| 3 | `next build --webpack`, then `opennextjs-cloudflare build`; `next.config.mjs`: `output: 'standalone'`, the trace root at the workspace root, `@opentelemetry/api` traced whole, `images.unoptimized`, the platform proxy under `next dev` | Turbopack's Worker is 11.7 MiB gzipped (over Paid's 10); OpenNext's bundler reads the package's ESM build, which the tracer did not copy |
| 4 | `lib/db/index.ts`: `db` is a proxy onto a client built per request from the `HYPERDRIVE` binding (upstream's `DATABASE_URL` client without one) | No socket outlives a request on Workers |
| 5 | `lib/auth/better-auth/config.ts`: the secret is `BETTER_AUTH_SECRET`, else the key `200_app_secrets` generated in `app_private.secrets`; `getAuth()` is async (thirteen call sites `await` it); its tests adapted, and five added for the generated key | Nothing to type at bootstrap |
| 6 | `instrumentation.ts` loads Langfuse and OTel only when `ENABLE_LANGFUSE_TRACING=true`; `langfuseSpanProcessor` a no-op until then; its test rewritten for both halves | Loading them at the hook fails every request on Workers |
| 7 | `lib/utils/safe-fetch.ts`: inside a Worker, no undici dispatcher (literal private addresses still refused on every hop); three tests added | A Worker has no host network and its fetch takes no dispatcher |
| 8 | `app/api/advanced-search` removed; SearXNG's advanced depth is the provider's own (`lib/tools/search.ts`); `redis` dropped; `jsdom` a dev dependency (vitest's DOM) | The route crawls with jsdom and caches in Redis over TCP |
| 9 | `lib/utils/context-window.ts` counts with js-tiktoken/lite and the two encodings it names | The main entry bundles every encoding (megabytes) |
| 10 | `app/relay/[...path]/route.ts`'s `cappedBody` and `PayloadTooLargeError` moved, unchanged, to `lib/analytics/relay-body.ts` | Next 16.3's build refuses a route module's non-route exports |
| 11 | `lib/site.ts` (`SITE_NAME`) for every place the product names itself — the title, the sidebar, the sign-in dialogs, the prompt's identity, the emails, the maintenance page, the disclaimer; comments that named the template reworded; the fetch tool's User-Agent token lowercased | One rename seam; the template's name is this baseline's slug |
| 12 | `app/layout.tsx`'s `metadataBase` is `NEXT_PUBLIC_SITE_URL` (upstream: its hosted site) | Every copy would have advertised upstream's origin |
| 13 | `proxy.ts`'s matcher excludes `api/health` | The deploy's check needs no session and must answer when the database does not |
| 14 | `app/api/health/route.ts` and `lib/health.ts` added, with tests | The deploy's smoke and the deployment record |
| 15 | `drizzle/0021_app_secrets.sql`, `drizzle/0022_row_level_security.sql` journalled after upstream's | Local databases match stage and prod |
| 16 | `AUTH_PROVIDER=better-auth`, `AUTH_SIGNUP_MODE=invite` as Worker variables | Upstream defaults to anonymous or open sign-up, wrong for a public URL |
| 17 | Not carried: the Dockerfile and Compose file, SearXNG's settings, `docs/`, `evals/` (and its tests), `scripts/` (Bun CLIs), upstream's `.github`, `AGENTS.md`, `CLAUDE.md` | A Worker, not a container; the evals and CLIs call live models through Bun |

## Departures from the reference

| # | What | Why |
|---|---|---|
| 1 | No `ai` binding; the models and search are the owner's keys | The template's providers are vendor APIs; Workers AI is not one of them (design, Alternatives) |
| 2 | `apps/web` declares `optionalSecretEnv` for seven keys, unset for the build and set on the Worker by `tooling/wire/worker-secrets.mjs` | clerk-auth-starter's mechanism; the app reads them at request time |
| 3 | `210_row_level_security` revokes the Data API's privileges as well as enabling RLS | Upstream's policies are written `TO public` |
| 4 | The rename engine renames the env-var prefix (`MORPHIC_*`) and masks upstream's repository strings | The template's name is this baseline's slug |
| 5 | The e2e serves the Worker twice — as it deploys, then given a stand-in OpenAI-compatible model in upstream's anonymous mode — instead of a Workers AI stand-in | Better Auth's sign-up runs only through server actions |
| 6 | The Worker needs Workers Paid | 7.7 MiB gzipped |

## Verified

- `pnpm typecheck`, `lint`, `test` and `build` green: the template's own
  suite (146 files pass; 2 skip themselves without live keys; the crawl4ai
  file's 16 tests resolve `example.com`, which this build's machine's
  resolver does not answer — they run on Baseline CI, MO-K), tests/web 20,
  tests/db 15. The Worker is 7.7 MiB gzipped (34,285 KiB raw).
- The built Worker served by `wrangler dev` over a PGlite stand-in for
  Postgres (a local pre-flight, not a test of record): the page with "No
  enabled model available", `/api/health`, invite-only sign-up, a signed-out
  chat refused; then, given a stand-in model, a question answered and the
  chat kept.
- Every contract tier, the leak gate and the placement tier pass locally on
  orun v2.89.0. The e2e tier needs a PostgreSQL server (initdb, pg_ctl,
  psql), which this build's machine did not have: it ran on Baseline CI,
  where every pull request ran it before it merged.
