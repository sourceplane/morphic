# morphic — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a product built from it; the
two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Vercel's Morphic template (miurla/morphic) — an AI answer engine with a
generative UI — on Cloudflare Workers + Static Assets through
`@opennextjs/cloudflare`, its chat history and Better Auth accounts in a
Supabase project's Postgres reached through Hyperdrive, packaged as an Orun
baseline: `orun new --blueprint repo-blueprint.yaml` builds a new product in
its own repository and takes it to live on stage and prod in one landing
(`01-product`) — the Supabase project, then the Hyperdrive config, then the
migrations, then the Worker — and records what went live (`02-docs`). A fresh
product serves with no model or search key and sign-up invite-only; it
answers once its owner sets a model provider's key and a search provider's
key. The Cloudflare account must be on Workers Paid (the Worker is about
7.7 MiB gzipped).

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (MO0–MO2: the epic, the answer engine on Workers and Supabase, the baseline) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI: the template's own suite, the migrations on a Postgres with Supabase's roles, the built Worker served as it deploys, and a question answered through the chat on a stand-in model and kept in Postgres. Real models and search providers, a deploy with the brokered token, the Terraform and db-migrate applies and a live bootstrap are still to come (risks MO-A, MO-B) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/morphic/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/morphic/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/morphic/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `docs/` beside each `component.yaml` — `apps/web`, `packages/db`, `infra/db-migrate`, `infra/terraform/{supabase,cloudflare-hyperdrive}`, `tests/{web,db}` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one product from `baseline-v1` against a workspace with
   Cloudflare (on Workers Paid) and Supabase connected (two free project
   slots, MO-G): the first Terraform and db-migrate applies and the first
   deploy under the brokered token; then set a model key and a search key
   and ask it something (closes MO-A, MO-B).
