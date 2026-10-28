# morphic — implementation plan

Three milestones, each one reviewed pull request (MO0 is the repository's
first commit and its spec), each green before it merges.

## MO0 — the spec (MO-1)

The repository is born: `intent.yaml` with the placeholder workspace
`ws_CHANGE_ME`, `ci.yml` (rag-chatbot's own copy of turso-starter's), the
shared TypeScript and ESLint configuration, the wiring renderer and migration
helpers, the spec index, this doc set and the task contracts.

## MO1 — the answer engine on Workers and Supabase (MO-2)

- The template in `apps/web` on Next.js 16.3.8, built with webpack:
  `lib/db/index.ts`'s per-request client behind upstream's `db`, the
  generated Better Auth key (`getAuth()` async), OTel loaded only for
  tracing, the fetch guard inside a Worker, SearXNG's crawling route dropped,
  js-tiktoken's two encodings, the relay route's helpers moved out of the
  route module, `lib/site.ts` (the name seam), `app/api/health/route.ts`
  (`lib/health.ts`).
- `wrangler.template.jsonc` + `wiring.fixture.json`, `component.yaml` (the
  owner's keys as optional secrets, unset for the build and set on the
  Worker, the smoke).
- `packages/db`: upstream's 100–120, `200_app_secrets`,
  `210_row_level_security`, and their drizzle-kit twins; the Supabase and
  Hyperdrive roots; `infra/db-migrate`.
- The template's own tests (adapted where the port changes behaviour) and
  `tests/web` (the client, the name and origin, the wrangler config, the
  keys' contract, `worker-secrets.mjs`) and `tests/db` (the manifest, the
  twins, the generated key, the Data API shut out, on PGlite set up as a
  Supabase project).

## MO2 — a baseline (MO-3)

rag-chatbot's machinery on this tree: `blueprint.yaml`,
`repo-blueprint.yaml` (five brokered keys), `.baseline/` (identity, the
product's README with "First steps" and "Connect a model and a search
provider", task contracts), the rename engine (an env-prefix rule; upstream's
repository masked), the bootstrap helpers, the deployment-record renderer
(what is connected, from `/api/health`), the phase pages, the context pack,
and the baseline's tests — the e2e serving the built Worker as it deploys
and then on a stand-in OpenAI-compatible model.
