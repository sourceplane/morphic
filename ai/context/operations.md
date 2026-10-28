# morphic — operating contract (for humans and agents)

This is the standing guide to how this product is deployed and operated.
Instance facts (live URLs, workspace, whether a model and a search provider
are connected, the secrets it uses) live in [deployment.md](deployment.md), rendered from
probed reality by the bootstrap's `02-docs` phase; this file is the contract
that stays true between deployments. It is written to give an agent with
repository read access enough context to reason about and operate the product
without any other source.

## What this system is

An AI answer engine with a generative UI (upstream: miurla/morphic): it
searches the web and answers with its sources cited, in quick or adaptive
mode, over a model the owner connects (OpenAI, Anthropic, Google, or any
OpenAI-compatible API) and a search provider the owner connects (Tavily by
default; Exa, Firecrawl, Brave, or a SearXNG of the owner's) — with chat
history and sharing, a library of notes and files, and multi-user accounts
with Better Auth, invite-only — on Cloudflare Workers. Its chats and accounts
are a Supabase project's Postgres, reached through Cloudflare Hyperdrive.
Expressed as an Orun component-native desired-state repo. Seven components:

- **`infra/terraform/supabase`** (`supabase`) — one Supabase project per
  environment. Its apply publishes `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` onto the environment's secret
  rung.
- **`infra/terraform/cloudflare-hyperdrive`** (`cloudflare-hyperdrive`) — one
  Hyperdrive config per environment over that database. Its apply publishes
  `WIRING_CLOUDFLARE_HYPERDRIVE` (the config's id and name).
- **`infra/db-migrate`** (`db-migrate`) — applies `packages/db`'s migrations
  to the environment's database through Supabase's Management API:
  upstream's twenty-one (chats, messages, parts, feedback, the library,
  usage, Better Auth's tables, their policies), then `200_app_secrets` (Better
  Auth's signing key, generated once in `app_private.secrets`) and
  `210_row_level_security` (Supabase's Data API shut out of every table).
  Each migration is recorded with its checksum in `_migrations.applied`; only
  the missing ones apply.
- **`packages/db`** (`db`) — the migrations and their runner.
- **`apps/web`** (`web`) — the app: Next.js built by `@opennextjs/cloudflare`
  (webpack) into one Worker plus Static Assets. It reaches Postgres through
  its `HYPERDRIVE` binding, one client per request behind upstream's `db`
  (`lib/db/index.ts`), and its models and search providers over HTTPS with
  the owner's keys, which the deploy sets as Worker secrets.
- **`tests/web`**, **`tests/db`** — vitest suites, verified on the `dev` rung.
  The template's own suite (in `apps/web`) runs with `pnpm test`.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. Per environment, in this order — each edge `mode: enforced` on a push to
   main, advisory on a pull request (which deploys nothing):
   **`supabase` → `cloudflare-hyperdrive` → `db-migrate` → `web`.** A job
   resolves its secrets when it starts, so each one reads what the apply
   before it published. The app's deploy re-renders `apps/web/wrangler.jsonc`
   from `WIRING_CLOUDFLARE_HYPERDRIVE` before it builds, deploys
   `morphic-web-<env>` — after handing it the owner's keys that are set,
   as Worker secrets — and smoke-tests it: the page, `/api/health`, which
   answers 200 only when the database is reachable through Hyperdrive and
   migrated (the generated Better Auth key in it), and the sign-in page.
   None calls a model or a search provider.
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "product
  converged"; probe the URLs instead.
- `apps/web/wrangler.jsonc` is committed as the render of
  `wrangler.template.jsonc` from `wiring.fixture.json` (a placeholder
  Hyperdrive id): edit the template and run `pnpm run wire:fixture`. The
  deploy lanes render the real one in their own job tree; never commit a
  real id.
- **The owner's keys never reach a build.** `apps/web/component.yaml`
  runs the build with each one unset and hands the ones present to the
  Worker after it (`tooling/wire/worker-secrets.mjs`). A key set on the
  Worker stays until it is deleted there; removing the Orun secret does not
  remove it.
- Every table in `public` has row-level security, and `anon` and
  `authenticated` hold no privilege on any of them (migration 210).
  Supabase's Data API serves `public` to the anon key, and upstream's
  policies are written `TO public` — so the revoked privileges are what keep
  every chat, account and session out of it. The app is unaffected because it
  connects as `postgres`, the tables' owner. Never `FORCE` row-level
  security, and never grant `anon` or `authenticated` anything without
  meaning to publish that table.
- A migration is immutable once applied: its checksum is in
  `packages/db/src/manifest.ts` and in the database's ledger. Change the
  schema with a NEW migration (in `packages/db/src/migrations`, and its
  drizzle-kit twin in `apps/web/drizzle` and its journal, for local
  databases).

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  connections — no long-lived values at rest, nothing to rotate by hand:
  `CLOUDFLARE_API_TOKEN` (Workers deploy and the Worker's secrets),
  `CLOUDFLARE_HYPERDRIVE_TOKEN` (Hyperdrive — the deploy token deliberately
  cannot touch it), `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN` (project
  create and migrations) and `SUPABASE_ORG_ID`.
- **Published by the applies** onto the stage and prod rungs:
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`,
  `WIRING_CLOUDFLARE_HYPERDRIVE`.
- **The owner's, optional, per environment** (Orun secrets the web lane
  resolves as `optionalSecretEnv` and sets on the Worker):
  `BOOTSTRAP_ADMIN_EMAIL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`,
  `BRAVE_SEARCH_API_KEY`. No platform brokers them.
- **Generated, not a secret anywhere:** Better Auth's signing key, in the
  database (`app_private.secrets`, `better_auth_secret`). A
  `BETTER_AUTH_SECRET` Worker secret wins; rotating either signs everyone out.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.

## Connect a model and a search provider

The answer engine needs one model provider's key and one search provider's
key; until both are set, its model picker says "No enabled model available"
(or its searches fail, naming the missing key). Per environment:

```bash
orun secrets set OPENAI_API_KEY --env <env>     # or ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
orun secrets set TAVILY_API_KEY --env <env>     # or EXA_API_KEY with SEARCH_API=exa
gh workflow run ci.yml --ref main -f environment=<env> -f component=web
```

The redeploy hands them to the Worker; `/api/health` then reports
`"model":true,"search":true`. Anything else upstream reads (an
OpenAI-compatible endpoint, SearXNG, Firecrawl, Jina, SMTP, OIDC, Langfuse,
`SEARCH_API`) is a Worker variable or secret the owner sets with
`wrangler secret put <NAME> --name morphic-web-<env>`, named as upstream
names it. Re-running the bootstrap's `02-docs` phase records what is
connected in [deployment.md](deployment.md).

## Accounts

Better Auth, invite-only (`AUTH_SIGNUP_MODE=invite`, a Worker variable): a
workers.dev URL is public from its first deploy. The first account is the
address `BOOTSTRAP_ADMIN_EMAIL` names, and only while the user table is
empty; without SMTP, whoever submits that address first wins the window, so
claim it before sharing the URL. The admin invites everyone else from the
admin page (user menu → Admin). Password reset needs SMTP and
`BETTER_AUTH_URL`; without them the admin sets members' passwords there.

## Verifying the system

```bash
# the app and its database path on each environment (also recorded, probed, in deployment.md)
curl -s -o /dev/null -w '%{http_code}\n' https://morphic-web-stage.your-workers-subdomain.workers.dev/
curl -s https://morphic-web-prod.your-workers-subdomain.workers.dev/api/health

# what is connected: {"ok":true,"database":true,"model":<bool>,"search":<bool>}
curl -s https://morphic-web-stage.your-workers-subdomain.workers.dev/api/health

# workspace readiness (integrations + repository link)
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| change the schema | change `apps/web/lib/db/schema.ts`, `pnpm --filter @app/web exec drizzle-kit generate` against a local database, copy the SQL file it writes into a new `packages/db/src/migrations/<nnn>_<name>/up.sql` (byte for byte: `tests/db` checks every app migration has its twin in `apps/web/drizzle`, in the journal's order) and the manifest (`pnpm --filter @saas/db run manifest:fix` for its checksum), merge — db-migrate applies it before the app deploys, and migration 210's revocation covers new tables (default privileges) |
| connect a model or a search provider | above |
| claim the instance, invite members | "Accounts", above |
| redeploy without a change | edit the last line of the component's `component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| serve a custom domain | attach it to the Worker in Cloudflare, then set `SITE_URL` under that environment's `env:` in `intent.yaml` (the page's canonical and Open Graph links are absolute), replace the placeholder `morphic.example.com` in its `BASE_DOMAIN` with the domain, and merge |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

Structural changes (a second Worker, a queue, another data store) follow the
same contract that deployed the product: add a component under `apps/`,
`infra/` or `packages/` with a `component.yaml` — declaring `dependsOn` on
any infrastructure whose published secrets it reads, enforced on main — land
it as a pull request, and the convergence run applies it.
