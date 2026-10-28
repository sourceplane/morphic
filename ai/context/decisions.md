# morphic — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | OpenNext on Workers + Static Assets, Next 16.3.8, built with webpack | 16.3.8 is the adapter's floor (upstream locks 16.2.6); Turbopack's server chunks duplicate modules per route and the Worker came out at 11.7 MiB gzipped, over Workers Paid's 10 MiB — webpack shares them (7.7 MiB) | `specs/epics/morphic/design.md` §2 |
| 2 | Workers Paid, not Free | 7.7 MiB gzipped is over Free's 3 MiB; trimming further would mean removing upstream's providers or features | design.md §2, risk MO-C |
| 3 | `db` stays upstream's name and type, a proxy onto a `postgres` client built per request over the `HYPERDRIVE` binding (keyed by the request's ExecutionContext) | Workers refuse a socket opened in another request; every caller of upstream's `db` stays unchanged | design.md §3 |
| 4 | Upstream's twenty-one migrations byte for byte in `packages/db` (100–120), applied by db-migrate before the Worker deploys; drizzle-kit keeps them for local work | Lumen's runner; the build stays credential-free; migrations are immutable | design.md §4 |
| 5 | Better Auth, invite-only, by default; its key generated in the database (`200_app_secrets`), `getAuth()` async to read it | A public workers.dev URL with open sign-up hands the admin to its first visitor; a typed secret is a step a bootstrap cannot take | design.md §5, risk MO-D |
| 6 | Models and search are the owner's keys, optional Orun secrets the deploy sets as Worker secrets; the build runs with them unset | The platform brokers neither; a key in a bundle or a build cache is a leak | design.md §6 |
| 7 | Migration 210 enables row-level security on every table and revokes the Data API's privileges | Upstream's policies are written `TO public`, which on Supabase includes `anon`: RLS alone would publish public chats and feedback | design.md §4, risk MO-E |
| 8 | OTel and Langfuse load only when tracing is on | Loading them in the instrumentation hook fails every request on Workers | design.md §7 |
| 9 | Inside a Worker the fetch guard passes no undici dispatcher; literal private addresses are still refused on every hop, and `global_fetch_strictly_public` keeps fetches public | A Worker has no host network to guard and its `fetch` takes no dispatcher; off Workers the guard is upstream's | design.md §7 |
| 10 | SearXNG's `/api/advanced-search` route is not carried; SearXNG's advanced depth is the provider's own | It crawls with jsdom and caches in Redis over TCP; Tavily is the brief's and upstream's default | design.md §7 |
| 11 | `apps/web/wrangler.jsonc` is committed as the fixture render; the stage and prod lanes re-render it from the Hyperdrive wiring document | The composition checks the file exists before the build | design.md §4 |
| 12 | The template's name is this baseline's slug: the product's name in code reads `SITE_NAME`, its `MORPHIC_*` variables take the product's prefix (a rename rule), and only upstream's repository strings are masked | The residue sweep must stay as strict as ever | `tooling/rebrand/rebrand.mjs`, `testing/rebrand.test.sh` |
| 13 | One landing (`01-product`) then the record (`02-docs`); one convergence runs supabase → cloudflare-hyperdrive → db-migrate → web, enforced on `main`, advisory on a pull request | A job resolves its secrets when it starts, so each apply must finish before its reader | `repo-blueprint.yaml` |
| 14 | The rag-chatbot baseline's shape on orun v2.88.0: `ci.yml` alone, the brokered keys in one `secrets` reconcile per provider, generated component docs, the subdomain read from the Cloudflare connection, no domain asked | The current standard | `repo-blueprint.yaml`, `blueprint.yaml` |
