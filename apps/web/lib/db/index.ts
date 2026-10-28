import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as relations from './relations'
import * as schema from './schema'

// For server-side usage only
// Use restricted user for application if available, otherwise fall back to regular user
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

// Connection with connection pooling for server environments
// Prefer restricted user for application runtime
const restrictedDatabaseUrl =
  process.env.DATABASE_RESTRICTED_URL?.trim() || undefined
const databaseUrl = process.env.DATABASE_URL?.trim() || undefined
const connectionString =
  restrictedDatabaseUrl ?? // Prefer restricted user
  databaseUrl ??
  (isTest ? 'postgres://user:pass@localhost:5432/testdb' : undefined)

const databaseErrorMessage =
  'DATABASE_URL or DATABASE_RESTRICTED_URL environment variable is not set, and there is no HYPERDRIVE binding'

const createDatabase = (url: string) => {
  // Log which connection is being used (for debugging)
  if (isDevelopment) {
    console.log(
      '[DB] Using connection:',
      restrictedDatabaseUrl
        ? 'Restricted User (RLS Active)'
        : 'Owner User (RLS Bypassed)'
    )
  }

  // SSL configuration: Use environment variable to control SSL
  // DATABASE_SSL_DISABLED=true disables SSL completely (for local/Docker PostgreSQL)
  // Default is to enable SSL with certificate verification (for cloud databases like Neon, Supabase)
  const sslConfig =
    process.env.DATABASE_SSL_DISABLED === 'true'
      ? false // Disable SSL entirely for local PostgreSQL
      : { rejectUnauthorized: true } // Enable SSL with verification for cloud DBs

  const client = postgres(url, {
    ssl: sslConfig,
    prepare: false,
    max: 20 // Max 20 connections
  })

  return drizzle(client, {
    schema: { ...schema, ...relations }
  })
}

type Database = ReturnType<typeof createDatabase>

// ── On Cloudflare Workers ─────────────────────────────────────────────────
// The one structural departure in this file, forced by the Workers runtime.
// Upstream opened one `postgres` client at module scope; on Workers the
// database is the HYPERDRIVE binding (Hyperdrive pools the real Postgres
// connections at the edge), and a socket opened in one request cannot be
// used by another ("Cannot perform I/O on behalf of a different request").
// So each request gets its own client, built from the binding's connection
// string the first time that request touches `db` and reused for the rest of
// it (keyed by the request's ExecutionContext). Hyperdrive terminates TLS
// itself and pools on its side: the client holds few connections, skips the
// pg_types round trip and sends plain (unprepared) statements.
//
// `db` keeps upstream's name and type, so every caller is unchanged: it is a
// proxy onto the request's client. Without a Cloudflare context — drizzle-kit,
// `lib/db/migrate.ts`, the tests — it is upstream's DATABASE_URL client.
const perRequest = new WeakMap<object, Database>()

function hyperdriveDatabase(): Database | undefined {
  let context: ReturnType<typeof getCloudflareContext>
  try {
    context = getCloudflareContext()
  } catch {
    return undefined // not inside a Worker request
  }
  const hyperdrive = (context.env as { HYPERDRIVE?: { connectionString?: string } })
    .HYPERDRIVE
  if (!hyperdrive?.connectionString) {
    return undefined
  }
  const key = context.ctx as object
  let database = perRequest.get(key)
  if (!database) {
    database = drizzle(
      postgres(hyperdrive.connectionString, {
        max: 5,
        fetch_types: false,
        prepare: false
      }),
      { schema: { ...schema, ...relations } }
    )
    perRequest.set(key, database)
  }
  return database
}

let fallbackDatabase: Database | undefined
function urlDatabase(): Database | undefined {
  if (!connectionString) {
    return undefined
  }
  fallbackDatabase ??= createDatabase(connectionString)
  return fallbackDatabase
}

let warnedUnconfigured = false
function currentDatabase(): Database {
  const database = hyperdriveDatabase() ?? urlDatabase()
  if (!database) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true
      console.warn(
        '[DB] Database is not configured. Only guest chat (ENABLE_GUEST_CHAT=true) works without a database.'
      )
    }
    throw new Error(databaseErrorMessage)
  }
  return database
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const database = currentDatabase()
    const value = Reflect.get(database as object, property, database)
    return typeof value === 'function' ? value.bind(database) : value
  }
})

// Helper type for all tables
export type Schema = typeof schema

// Verify restricted user permissions on startup
if (restrictedDatabaseUrl && !isTest) {
  // Only run verification in server environments, not during build
  if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
    ;(async () => {
      try {
        const result = await db.execute<{ current_user: string }>(
          sql`SELECT current_user`
        )
        const currentUser = result[0]?.current_user

        if (isDevelopment) {
          console.log('[DB] ✓ Connection verified as user:', currentUser)
        }

        // Verify it's the restricted user (app_user)
        if (
          currentUser &&
          !currentUser.includes('app_user') &&
          !currentUser.includes('neondb_owner')
        ) {
          console.warn(
            '[DB] ⚠️ Warning: Expected app_user but connected as:',
            currentUser
          )
        }
      } catch (error) {
        console.error('[DB] ✗ Failed to verify database connection:', error)
        // Log the error but don't terminate the application
        // This allows development to continue even with connection issues
      }
    })()
  }
}
