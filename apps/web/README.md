# apps/web

The answer engine (upstream: miurla/morphic): web search with cited sources
and a generative UI, quick and adaptive modes, a model picker, chat history
and sharing, a library, Better Auth accounts — built by
`@opennextjs/cloudflare` into one Worker plus Static Assets.

- The page and its routes: `app/` (`app/api/chat/route.ts` runs the research
  agent, `lib/agents`, with its tools, `lib/tools`).
- Models: `lib/utils/registry.ts`, `lib/models` — each provider enabled by its
  key. Search: `lib/tools/search/providers` — Tavily unless `SEARCH_API` says
  otherwise.
- Postgres through the `HYPERDRIVE` binding, one client per request behind
  `db` (`lib/db/index.ts`); the schema in `lib/db/schema.ts`, its migrations in
  `drizzle/` (the same files `packages/db` applies to stage and prod).
- Accounts: Better Auth (`lib/auth`), invite-only; its key generated in the
  database.
- `/api/health` (`lib/health.ts`): the database, and whether a model and a
  search provider are connected.

```bash
pnpm dev          # next dev on http://localhost:3000 (the bindings through wrangler's platform proxy)
pnpm build        # next build --webpack + opennextjs-cloudflare build
pnpm preview      # the built Worker under wrangler dev
pnpm migrate      # drizzle's migrator, against DATABASE_URL
pnpm test         # the template's own suite (vitest)
```

Configuration, the keys an owner connects and how it deploys are the
repository's README and `ai/context/operations.md`.
