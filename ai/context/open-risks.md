# morphic — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted ones, is
`specs/epics/morphic/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| MO-A | Models and search are verified only against a stand-in: what a real model calls among the research agent's tools, and the search providers' real answers, are unproven on Workers | OPEN | A bootstrap with a real model key and search key, asking the deployed Worker |
| MO-B | No live deploy yet: the Terraform and db-migrate applies, the brokered deploy token setting Worker secrets, and the Worker on Hyperdrive to a real Supabase | OPEN | The first live bootstrap |
| MO-C | 7.7 MiB gzipped: Workers Paid is required, and an upstream release that grows the bundle could cross Paid's 10 MiB | OPEN | Watch the dry-run's `Total Upload` on every bump |
| MO-F | OpenNext calls Node.js middleware (upstream's `proxy.ts`) experimental on Cloudflare | OPEN | An OpenNext release that supports it |

Accepted, and worth knowing before you change them: MO-D (without SMTP,
whoever submits `BOOTSTRAP_ADMIN_EMAIL` first wins the admin), MO-G (two
Supabase projects per product — the organization needs room for both), MO-H
(the Postgres.js client sends unprepared statements through Hyperdrive, as
the other Supabase baselines do; Cloudflare's guide prefers prepared ones).
