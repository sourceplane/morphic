# morphic — risks and open questions

| ID | Risk | State | Notes |
|---|---|---|---|
| MO-A | Models and search only against a stand-in | OPEN | The e2e answers a question through the chat route on a stand-in OpenAI-compatible API and keeps the chat in Postgres; what a real model does with the research agent's tools, and the real search providers on Workers, are unproven until an owner connects them |
| MO-B | `baseline-v1` is not yet proven live | OPEN | Proven offline in Baseline CI: the offline bootstrap with the blueprint's own hooks, the lanes' own steps in staged job trees (the migrations applied through a stand-in Supabase Management API over a real Postgres with Supabase's roles), and the built Worker served by `wrangler dev` over it. A live bootstrap needs a workspace with Cloudflare (Workers Paid) and Supabase connected and room for two Supabase projects (MO-G) |
| MO-C | Workers Paid, 7.7 MiB of 10 | OPEN | Under Free's 3 MiB there is no fit without removing upstream's providers or features. An upstream release that grows the bundle could cross Paid's limit: the e2e's dry deploy prints the size |
| MO-D | Without SMTP the bootstrap window is first-come | ACCEPTED | Upstream's own behaviour: with `BOOTSTRAP_ADMIN_EMAIL` set and no SMTP, whoever submits that address first becomes the admin. The README says to claim it before sharing the URL |
| MO-E | Upstream's policies are written `TO public` | ACCEPTED | Mitigated by `210_row_level_security`, which revokes the Data API's privileges; `tests/db` and the e2e check that neither role can read a chat even when it is public |
| MO-F | Node.js middleware on OpenNext | OPEN | `opennextjs-cloudflare build` says Node.js middleware support is experimental; upstream's `proxy.ts` runs every request. The e2e serves every route through it |
| MO-G | Two Supabase projects per product | ACCEPTED | Stage and prod are a project each; the free plan allows two active projects per organization |
| MO-H | Unprepared statements through Hyperdrive | ACCEPTED | The per-request client sends `prepare: false`, as rag-chatbot and admin-dashboard do; Cloudflare's guide prefers prepared statements with Postgres.js through Hyperdrive |
| MO-I | Langfuse tracing on Workers | OPEN | Loading the OTel SDK at the instrumentation hook fails on Workers ("No such module node:process"); with tracing on it loads on demand, which is unproven |
| MO-J | Uploads, SMTP, OIDC, Ollama unproven on Workers | OPEN | Upstream's optional features, kept as written: S3-compatible uploads (the owner's R2 S3 credentials), nodemailer over TCP, generic OIDC, Ollama (a server the Worker would have to reach) |
| MO-K | The template's crawl4ai tests resolve a public name | ACCEPTED | `lib/tools/__tests__/fetch.test.ts` resolves `example.com` for real, as upstream's does; they run wherever that name resolves (GitHub's runners) |
