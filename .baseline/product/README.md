# morphic

The answer engine of [miurla/morphic](https://github.com/miurla/morphic) — an AI answer engine with a
generative UI: it searches the web and answers with its sources cited,
rendering rich inline components as the answer streams. Quick and adaptive
search modes, a model picker over OpenAI, Anthropic, Google and any
OpenAI-compatible API, chat history with sharing, a library of notes and
files, and multi-user accounts with Better Auth — on **Cloudflare Workers +
Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). Its chat
history and accounts are a **Supabase** project's Postgres reached through
**Cloudflare Hyperdrive**. Terraform provisions both per environment and
Orun's `db-migrate` applies upstream's schema, all on every merge to `main`.
The Cloudflare account must be on **Workers Paid**: the Worker is about
7.7 MiB gzipped, over Workers Free's 3 MiB.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace, what is connected and the secrets the product uses into
[ai/context/deployment.md](ai/context/deployment.md); how the product deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## First steps

The product goes live with nothing connected: its model picker says "No
enabled model available", and sign-up is invite-only with no invitations yet.
Per environment (stage, then prod):

1. **Claim the instance.** Set the Orun secret `BOOTSTRAP_ADMIN_EMAIL` to
   your address (below), redeploy, open `/auth/sign-up` and sign up with that
   address: the first account is the admin. Until the user table has a row,
   only that address can sign up — so do this before you share the URL.
2. **Connect a model and a search provider** (below), and redeploy.
3. **Invite people** from the admin page (user menu → Admin): each invitation
   is a link for one address.

## Connect a model and a search provider

The answer engine needs one model provider's key and one search provider's
key. Each is an **Orun secret** on the environment — never committed, never
typed into a file — and the next deploy hands the ones present to the Worker
as Worker secrets, which the app reads at request time:

| Orun secret | What it connects |
|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | a model provider; every model it offers appears in the picker |
| `TAVILY_API_KEY` | web search (the default provider) and page extraction |
| `EXA_API_KEY` | web search through Exa, with `SEARCH_API=exa` |
| `BRAVE_SEARCH_API_KEY` | Brave's video and image results, beside the main provider |
| `BOOTSTRAP_ADMIN_EMAIL` | the one address that may create the first account |

```bash
orun secrets set BOOTSTRAP_ADMIN_EMAIL --env stage   # prompts for the value
orun secrets set OPENAI_API_KEY        --env stage
orun secrets set TAVILY_API_KEY        --env stage
```

Then redeploy the app (Orunbase's **Deploy** on `web`, or `gh workflow run
ci.yml --ref main -f environment=stage -f component=web`). `/api/health`
reports `"model":true,"search":true` once both are there.

Everything else upstream reads — an OpenAI-compatible endpoint
(`OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_API_BASE_URL`), Firecrawl,
Jina, SMTP for password-reset email, an OIDC provider, Langfuse tracing —
is a Worker variable or secret you set yourself
(`wrangler secret put <NAME> --name morphic-web-<env>` from `apps/web`),
named as upstream names it; `apps/web/.dev.vars.example` lists them.

## What is here

| Surface | Where |
|---|---|
| The product's name | `apps/web/lib/site.ts` |
| The answer engine: the page, the chat route, the research agent and its tools | `apps/web/app`, `apps/web/lib/agents`, `apps/web/lib/tools` |
| Models and search providers | `apps/web/lib/utils/registry.ts`, `apps/web/lib/models`, `apps/web/lib/tools/search/providers` |
| Accounts (Better Auth), the admin page, invitations | `apps/web/lib/auth`, `apps/web/app/auth` |
| Drizzle schema and the per-request client over Hyperdrive | `apps/web/lib/db` (`index.ts`) |
| The database check the deploy smoke-tests | `apps/web/app/api/health/route.ts`, `apps/web/lib/health.ts` |
| Workers build, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc`, `component.yaml` |
| The schema as migrations, and their runner | `packages/db` (`@saas/db`); `apps/web/drizzle` is the same SQL for drizzle-kit |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | the template's own (`apps/web`, vitest), `tests/web`, `tests/db` |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (it is committed)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build --webpack + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no database, no model and no key: nothing pre-renders
against any of them.

## Running it locally

1. **A Postgres** on `localhost:5432`, database `morphic`, user and password
   `postgres` — the `localConnectionString` in
   `apps/web/wrangler.template.jsonc`:

   ```bash
   docker run --name morphic-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=morphic -p 5432:5432 -d postgres:17
   ```

2. **Schema.** Copy `apps/web/.env.example` to `apps/web/.env.local` and run
   upstream's migrations (`apps/web/drizzle`, the same SQL `packages/db`
   applies to stage and prod):

   ```bash
   pnpm --filter @app/web migrate
   ```

3. **Keys.** Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` and
   set a model key and a search key.

4. **Run.** Next's dev server, which gets the Worker's bindings through
   `getCloudflareContext()`, or the built Worker under `wrangler dev`:

   ```bash
   pnpm --filter @app/web dev          # http://localhost:3000
   pnpm build && pnpm --filter @app/web preview
   ```

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment the order is
enforced — **the Supabase project, then the Hyperdrive config over its
database, then the migrations, then the Worker** — because each reads what
the one before it published: the project's ref and password, the Hyperdrive
id the Worker binds, the schema the app queries. `stage` deploys first and
`prod` once stage has converged on the same commit; `dev` only verifies.
Every deploy is smoke-tested over HTTP: the page, `/api/health` — which
answers only when the Worker reaches a migrated database — and the sign-in
page.

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens and account id and the Supabase access token and org id
are brokered per run from the workspace's connections; the Supabase
project's credentials and the Hyperdrive id are published by the Terraform
applies as orun secrets; your model and search keys are the Orun secrets you
set. Better Auth's signing key is generated in the database by a migration
(`app_private.secrets`); a `BETTER_AUTH_SECRET` Worker secret wins if you set
one. Nothing provider-shaped is stored in the repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after setting a
secret, say. A component with nothing to run in that environment (a test
suite in `prod`) is left out with a notice.

## Custom domain

The app answers on workers.dev from its first deploy. To serve it on your
own domain, attach the domain to the Worker in Cloudflare (Workers & Pages →
`morphic-web-prod` → Settings → Domains & Routes), then set `SITE_URL`
under that environment's `env:` in `intent.yaml` — the page's canonical and
Open Graph links are absolute, and the build bakes the origin in — and merge
with a change under `apps/web`. With SMTP or an OIDC provider, also set
`BETTER_AUTH_URL` to that origin: emailed links and the OIDC callback are
built from it.

The repository names the domain in one more place, `BASE_DOMAIN` in
`intent.yaml` (one line per environment), which the product was born with as
the reserved placeholder `morphic.example.com`. Replace it with your
domain in the same change.

## CI

| Workflow | What it runs |
|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes — the app built and dry-deployed for each environment, both Terraform roots checked and planned, the migrations planned — with nothing applied or deployed. No lane runs the `typecheck`, `lint` or `test` scripts: run them yourself (above) before you push. A merge applies, migrates and deploys stage → prod |

## Credits

The app is [miurla/morphic](https://github.com/miurla/morphic)
(Apache-2.0, `apps/web/LICENSE`).
