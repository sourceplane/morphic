# morphic — Vercel's Morphic answer engine on Cloudflare

**The template's answer engine as it is — web search with cited sources and
a generative UI, quick and adaptive modes, a model picker, chat history and
sharing, a library of notes and files, Better Auth accounts — on one
Cloudflare Worker, its Postgres a Supabase project behind Hyperdrive,
upstream's schema applied before the Worker deploys; and the baseline that
makes a copy of it somebody else's product in one landing.**

| | |
|---|---|
| Status | ✅ Shipped (`baseline-v1`) — proven offline in Baseline CI; not yet live (risk MO-B) |
| Upstream | [miurla/morphic](https://github.com/miurla/morphic) (Apache-2.0), Vercel's [Morphic](https://vercel.com/templates/next.js/morphic-ai-answer-engine-generative-ui), at `92224b0` |
| Reference | [rag-chatbot](https://github.com/sourceplane/rag-chatbot) — an AI chat on Supabase through Hyperdrive, migrations, db-migrate, row-level security; [clerk-auth-starter](https://github.com/sourceplane/clerk-auth-starter) — the owner's keys handed to the Worker at deploy; [admin-dashboard](https://github.com/sourceplane/admin-dashboard) — a key generated in the database |
| Key | `MO` |

## Read in this order

1. [design.md](design.md) — the template, how each Vercel piece maps to
   Cloudflare and Supabase, the repository and the build, and the
   alternatives rejected.
2. [implementation-plan.md](implementation-plan.md) — the milestones.
3. [risks-and-open-questions.md](risks-and-open-questions.md) — what is not
   proven, and what was accepted.
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what shipped, and
   every departure from the upstream template.

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| MO0 — the spec | the repository, its intent, CI, tooling and spec index; this doc set | MO-1 |
| MO1 — the answer engine on Workers and Supabase | the template in `apps/web`, upstream's migrations with the generated key and the Data API shut out, the Supabase and Hyperdrive roots, the tests | MO-2 |
| MO2 — a baseline | the console card, the build document, the context pack and the baseline's tests | MO-3 |
