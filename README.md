# morphic

Vercel's [Morphic template](https://vercel.com/templates/next.js/morphic-ai-answer-engine-generative-ui)
([miurla/morphic](https://github.com/miurla/morphic)) — an AI answer engine
with a generative UI: it searches the web and answers with its sources cited,
quick and adaptive search modes, a model picker over OpenAI, Anthropic, Google
and any OpenAI-compatible API, chat history and sharing, a library of notes
and files, multi-user accounts with Better Auth — running on **Cloudflare
Workers + Static Assets** through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare),
its chat history and accounts a **Supabase** project's database reached
through **Cloudflare Hyperdrive**, both provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun) and upstream's schema applied by
Orun's `db-migrate` — the way the [Lumen baseline](https://github.com/sourceplane/lumen)
does it, and packaged as an **Orun baseline**: one command takes a new
product from nothing to live on stage and prod, in its own repository, under
its own name — in ONE landing. The Cloudflare account must be on **Workers
Paid**: the Worker is about 7.7 MiB gzipped, over Workers Free's 3 MiB.

The template's code is the code. What the port changes is what the Workers
runtime and a fresh, unattended deployment force: the database client is
built per request over the Hyperdrive binding behind upstream's own `db`
(`lib/db/index.ts`); Better Auth's signing key is generated in the database
by a migration instead of typed; the instrumentation loads OpenTelemetry only
when Langfuse tracing is on; the fetch guard's undici dispatcher steps aside
inside a Worker, which has no host network to guard; SearXNG's crawling
route, which needs jsdom and TCP Redis, is not carried; and a final
migration shuts Supabase's Data API out of every table. Models and search are
the owner's keys, set as Orun secrets after the build — the platform brokers
neither — so a fresh product serves with "No enabled model available" until
they are. What the baseline adds is everything needed to make a copy of it
somebody else's — built the way
[cirrus-baseline](https://github.com/sourceplane/cirrus-baseline) is. See [`specs/epics/morphic`](specs/epics/morphic/README.md)
for the design, the milestones and the as-built status, including every
departure.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/morphic
cd morphic
orun new --blueprint repo-blueprint.yaml --out ~/products/acme-search --run-hooks --resume \
  --set reponame=acme-search --set productname="Acme Answers" \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`morphic` → Build). Two phases: **`01-product`** creates the repository,
mints the five brokered credentials (Cloudflare and Supabase) and lands the
whole product as one pull request, whose convergence on `main` provisions and
deploys it per environment in a fixed order —

```
supabase ──▶ cloudflare-hyperdrive ──▶ db-migrate ──▶ web
```

— each edge `mode: enforced` on a push to main and advisory on a pull
request; then **`02-docs`** records the live deployment from probed facts.
**[BOOTSTRAP.md](BOOTSTRAP.md)** is the operator guide;
[docs/phases/](docs/phases/README.md) has a page per phase.

**It creates two Supabase projects**, `<reponame>-stage` and
`<reponame>-prod`. Supabase's free plan allows two active projects per
organization, so the connected organization needs room for both
(BOOTSTRAP.md, §0).

The new repository receives the **product only** — the app, the Terraform
roots, the migrations, the tests, its CI, its tooling, a README of its own
and its operating contract — renamed throughout to the product's name,
repository, Worker, Supabase project and Hyperdrive config. None of this
repository's machinery ships. **No model or search key is asked for**: the
owner sets them as Orun secrets afterwards, with the address of the account
that may sign up first (the product's README, "First steps").

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, the product's README and the bootstrap's task contracts | `.baseline/` |
| The rename engine (product-name seam: `apps/web/lib/site.ts`) | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's context pack | `ai/context/` |
| The baseline's tests: contract, leak, offline bootstrap and plans, end to end (with an OpenAI-compatible stand-in) | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

## What is here (the product)

| Surface | Where |
|---|---|
| The product's name | `apps/web/lib/site.ts` |
| The answer engine: the page, the chat route, the research agent and its tools | `apps/web/app`, `apps/web/lib/agents`, `apps/web/lib/tools` |
| Models and search providers | `apps/web/lib/utils/registry.ts`, `apps/web/lib/models`, `apps/web/lib/tools/search/providers` |
| Accounts (Better Auth), the generated signing key | `apps/web/lib/auth`, `apps/web/lib/auth/better-auth/config.ts` |
| Drizzle schema and the per-request client | `apps/web/lib/db` (`index.ts`) |
| The database check the deploy smoke-tests | `apps/web/app/api/health/route.ts`, `apps/web/lib/health.ts` |
| Workers build and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc` (committed), `component.yaml` |
| The owner's keys, handed to the Worker at deploy | `apps/web/component.yaml` (`optionalSecretEnv`), `tooling/wire/worker-secrets.mjs` |
| The schema as migrations, and Lumen's runner | `packages/db` (`@saas/db`); `apps/web/drizzle` is the same SQL for drizzle-kit |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | the template's own (`apps/web`, vitest, 150 files), `tests/web`, `tests/db` |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (committed; this changes nothing)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build --webpack + opennextjs-cloudflare build → apps/web/.open-next
pnpm --filter @saas/db run manifest:check
```

The build needs no database, no model, no key and no Cloudflare
credential. Running it locally — a Postgres on `localhost:5432`, `pnpm
--filter @app/web migrate`, a model key and a search key in
`apps/web/.dev.vars`, `next dev` or `wrangler dev` — is in the product's
README (`.baseline/product/README.md`), which is what a product built from
here carries.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting (Turbopack build, Node.js proxy, streamed chat route) | One Cloudflare Worker (`.open-next/worker.js`) + Static Assets through OpenNext, Next 16.3.8 (the adapter's floor; upstream locks 16.2.6), built with webpack: Turbopack's server chunks duplicate modules per route, and the Worker came out at 11.7 MiB gzipped, over Workers Paid's 10 MiB |
| `DATABASE_URL` (Neon or any Postgres), one `postgres` client at module scope | The Supabase project's Postgres through a Hyperdrive config; `db` is a proxy onto a client built per request from the `HYPERDRIVE` binding's connection string |
| `bun run migrate` (drizzle) or the Docker entrypoint | `packages/db` + `infra/db-migrate`: upstream's twenty-one migrations byte for byte, then the generated Better Auth key and the Data API shut out, applied through Supabase's Management API before the Worker deploys; drizzle-kit stays for local work (`apps/web/drizzle`, the same files) |
| `BETTER_AUTH_SECRET` and `BOOTSTRAP_ADMIN_EMAIL` typed into `.env.local` | The key generated in `app_private.secrets` by migration 200 (a Worker secret still wins); the bootstrap address an Orun secret; sign-up invite-only from the first deploy |
| Model and search keys in the Vercel project's environment | Orun secrets per environment, handed to the Worker as Worker secrets by the deploy (`optionalSecretEnv`, `worker-secrets.mjs`), never seen by the build |
| SearXNG (Docker Compose) and its `/api/advanced-search` crawl (jsdom, Redis over TCP) | Tavily by default, as upstream defaults; Exa, Firecrawl, Brave, or your own SearXNG at its basic and advanced depths — the crawling route is not carried |
| Langfuse/OpenTelemetry registered at start | Loaded only when `ENABLE_LANGFUSE_TRACING=true` |
| `undici` connect-time DNS guard on every fetch the agent makes | The same off Workers; inside a Worker (no host network) literal private addresses are refused on every hop and `global_fetch_strictly_public` keeps fetches on the public internet |
| A Postgres database created in the dashboard | `infra/terraform/supabase` (one project per environment) + `infra/terraform/cloudflare-hyperdrive` (one config per environment), ids and credentials as orun secrets |
| "Deploy with Vercel" (clone the template) | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, provisioned, deployed |

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the app built and dry-deployed per environment, both Terraform roots checked and planned, the migrations planned); no lane runs the `typecheck`, `lint` or `test` scripts — `baseline.yml`'s e2e tier runs them on the bootstrapped product before every tag, and a product's developers run them before they push. The bootstrap's own landings (`orun/BASE-*`) run `plan` alone and nothing waits for it — the landing was checked in the build box; a merge applies, migrates and deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
| `baseline.yml` | the baseline's own tiers: contract tests; the blueprint read by the pinned orun, the leak gate, the offline bootstrap and the product's own plans; the product built (the template's own test suite with it), migrated into a local Postgres with Supabase's roles, dry-deployed, served as it deploys, then given a stand-in model, asked a question and the chat kept; the Data API shut out | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |
