// The bindings wrangler.template.jsonc gives the Worker, as seen through
// `getCloudflareContext().env` from @opennextjs/cloudflare (which types `env`
// as the global `CloudflareEnv` interface for the app to augment). Declared by
// hand, not through @cloudflare/workers-types: that package retypes the
// global Request and Response (`json()` returns `unknown`), and the template
// is written against the DOM's.
interface CloudflareEnv {
  // The Supabase project's Postgres, fronted by Hyperdrive (lib/db/index.ts).
  HYPERDRIVE: { connectionString: string }
  ASSETS: { fetch(request: Request): Promise<Response> }
}
