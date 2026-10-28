import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { isProviderEnabled } from '@/lib/utils/registry'

// What /api/health reports — the deploy's smoke test and the deployment
// record read it (apps/web/component.yaml, hooks/render-deployment-docs.sh).
// Never a value: whether the database behind the HYPERDRIVE binding is
// reachable and migrated, and whether a model and a search provider are
// connected (booleans), so an owner can see what is left to set.

const MODEL_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'openai-compatible',
  'gateway',
  'ollama'
] as const

// The key each search provider reads (lib/tools/search/providers), by the
// SEARCH_API that picks it (default tavily).
const SEARCH_PROVIDER_SETTING: Record<string, string> = {
  tavily: 'TAVILY_API_KEY',
  exa: 'EXA_API_KEY',
  firecrawl: 'FIRECRAWL_API_KEY',
  searxng: 'SEARXNG_API_URL',
  brave: 'BRAVE_SEARCH_API_KEY'
}

export function modelConnected(): boolean {
  return MODEL_PROVIDERS.some(provider => isProviderEnabled(provider))
}

export function searchConnected(): boolean {
  const provider = process.env.SEARCH_API?.trim() || 'tavily'
  const setting = SEARCH_PROVIDER_SETTING[provider]
  return Boolean(setting && process.env[setting]?.trim())
}

export type Health =
  | { ok: true; database: true; model: boolean; search: boolean }
  | { ok: false; database: false; model: boolean; search: boolean }

/**
 * ok when the app's tables are there and the Better Auth key the
 * 200_app_secrets migration generates has been written — i.e. every migration
 * the deploy depends on has run against this database.
 */
export async function checkHealth(): Promise<Health> {
  const model = modelConnected()
  const search = searchConnected()
  try {
    const [row] = await db.execute<{ tables: boolean; secret: boolean }>(sql`
      select
        to_regclass('public.chats') is not null
          and to_regclass('public."user"') is not null as tables,
        exists (
          select 1 from app_private.secrets where name = 'better_auth_secret'
        ) as secret`)
    if (row?.tables && row?.secret) {
      return { ok: true, database: true, model, search }
    }
  } catch {
    // Unreachable, or not migrated (app_private.secrets missing).
  }
  return { ok: false, database: false, model, search }
}
