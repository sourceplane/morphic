# morphic — design

## The template

miurla/morphic at `92224b0` (v1.9.0): a Next.js 16 App Router app on the AI
SDK 7. A question goes to `app/api/chat/route.ts`, which runs the research
agent (`lib/agents/researcher.ts`) with its tools — `search` over a provider
(Tavily by default; Exa, Firecrawl, Brave, SearXNG), `fetch` (a page, through
a guarded fetch or an extraction service), `todo`, `question`, `editDraft` —
over the model the picker selects (OpenAI, Anthropic, Google, an
OpenAI-compatible API, Ollama or Vercel's AI Gateway, each enabled by its
key), and streams the answer with a generative-UI spec rendered inline. Chats,
messages and their parts, feedback, the library (notes, files) and usage live
in Postgres through Drizzle, with row-level security policies for a
restricted `app_user`. Accounts are one of three providers: anonymous (one
shared user), Better Auth (accounts in its own Postgres, admin, invitations,
OIDC) or Supabase Auth. Files upload to an S3-compatible bucket. Self-hosting
is Docker Compose with Postgres, Redis and SearXNG.

## How it maps to Cloudflare and Supabase

| Vercel / Docker | Here |
|---|---|
| Next.js hosting (Turbopack build, Node.js `proxy.ts`) | One Worker + Static Assets through `@opennextjs/cloudflare` 1.20.11, Next 16.3.8 (the adapter's floor), built with **webpack**: Turbopack's server chunks duplicate modules per route and the Worker came out at 11.7 MiB gzipped; webpack shares them — 7.7 MiB, under Workers Paid's 10 MiB. `proxy.ts` runs as Node.js middleware, which OpenNext calls experimental |
| `DATABASE_URL` (Neon, Supabase or Docker), one `postgres` client at module scope | A Supabase project per environment, reached through a Hyperdrive config; `db` is a proxy onto a client built per request from the `HYPERDRIVE` binding's connection string (`lib/db/index.ts`), so every caller of upstream's `db` is unchanged |
| `bun run migrate` / the Docker entrypoint | `packages/db`: upstream's twenty-one drizzle migrations byte for byte (100–120), then `200_app_secrets` and `210_row_level_security`, applied by `infra/db-migrate` through Supabase's Management API before the Worker deploys; `apps/web/drizzle` keeps the same files, journalled, for drizzle-kit |
| `BETTER_AUTH_SECRET` typed by whoever runs the container | Generated once per database (`200_app_secrets`, `app_private.secrets`) and read by `getAuth()` — async now, so it can — before the instance is built; a `BETTER_AUTH_SECRET` Worker secret wins |
| `AUTH_PROVIDER`, `AUTH_SIGNUP_MODE`, `BOOTSTRAP_ADMIN_EMAIL` in `.env.local` | `better-auth` and `invite` as Worker variables (`wrangler.template.jsonc`); `BOOTSTRAP_ADMIN_EMAIL` an optional Orun secret |
| Model and search keys in `.env.local` | Optional Orun secrets per environment (`optionalSecretEnv`), unset for the build and set on the Worker by the deploy (`tooling/wire/worker-secrets.mjs`, clerk-auth-starter's) |
| SearXNG (Docker) and `/api/advanced-search` (crawl with jsdom, cache in Redis over TCP) | Tavily by default; SearXNG at an owner's own URL, its advanced depth the provider's — the crawling route is not carried |
| Langfuse/OTel registered in `instrumentation.ts` at start | Loaded only when `ENABLE_LANGFUSE_TRACING=true`: on Workers, loading them at the hook fails every request |
| `safeFetch`'s undici dispatcher (connect-time DNS guard) | Unchanged off Workers; inside a Worker, which has no host network, no dispatcher — literal private addresses still refused on every hop, `global_fetch_strictly_public` set |
| Upstream's RLS policies written `TO public` for `app_user` | The app connects as `postgres`, the tables' owner; `210_row_level_security` enables RLS on every table and revokes the Data API's privileges, which `TO public` would otherwise have granted reads through |

## The repository

rag-chatbot's tree: `apps/web` (the template, its tests beside it), `packages/db`,
`infra/{db-migrate,terraform/supabase,terraform/cloudflare-hyperdrive}`,
`tests/{web,db}`, `tooling/` (TypeScript and ESLint configuration, the wiring
renderer and `worker-secrets.mjs`, the migrations' checksum tool, the rename
engine, the bootstrap helpers, the component-docs generator).

## The build

One landing (`01-product`) places every module, mints the five brokered keys
and merges; the convergence runs `supabase → cloudflare-hyperdrive →
db-migrate → web` per environment, enforced on a push to `main`. `02-docs`
probes the URLs and `/api/health` (database, model, search) and records them.

## Alternatives rejected

- **Turbopack.** The template's bundler; the Worker came out at 11.7 MiB
  gzipped, over Workers Paid's 10 MiB.
- **Workers AI as a default model.** It would answer with no key, but the
  answer engine cannot search without a search provider's key either, and
  the research agent's tool use and structured output were written against
  the vendors' models. The template's own "No enabled model available" state
  is the unconnected state.
- **Open sign-up.** Upstream's default; on a public workers.dev URL it hands
  the admin to the first visitor.
- **Anonymous mode.** Upstream's default for a personal instance: every
  visitor would share one history.
- **Uploads through an R2 binding.** The template signs URLs with S3
  credentials; an R2 binding cannot sign. Uploads stay upstream's, enabled by
  the owner's R2 S3 credentials.
- **Rewriting every `db` caller to `await getDb()`.** The proxy keeps upstream's
  code unchanged.

## Out of scope

Morphic Cloud mode (`MORPHIC_CLOUD_DEPLOYMENT`: Supabase Auth, Upstash,
PostHog), Ollama (a server on the host), Docker, the evals and the CLI.
