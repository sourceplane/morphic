import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { execute: vi.fn() }
}))

import { db } from '@/lib/db'
import { checkHealth, modelConnected, searchConnected } from '@/lib/health'

const KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_API_BASE_URL',
  'AI_GATEWAY_API_KEY',
  'OLLAMA_BASE_URL',
  'SEARCH_API',
  'TAVILY_API_KEY',
  'EXA_API_KEY'
]

describe('health', () => {
  beforeEach(() => {
    for (const key of KEYS) vi.stubEnv(key, '')
    vi.mocked(db.execute).mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports nothing connected on a fresh product', () => {
    expect(modelConnected()).toBe(false)
    expect(searchConnected()).toBe(false)
  })

  it('sees a model key and the default search provider (Tavily)', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('TAVILY_API_KEY', 'tvly-test')
    expect(modelConnected()).toBe(true)
    expect(searchConnected()).toBe(true)
  })

  it('reads the key of the search provider SEARCH_API picks', () => {
    vi.stubEnv('SEARCH_API', 'exa')
    vi.stubEnv('TAVILY_API_KEY', 'tvly-test')
    expect(searchConnected()).toBe(false)
    vi.stubEnv('EXA_API_KEY', 'exa-test')
    expect(searchConnected()).toBe(true)
  })

  it('is ok only when the tables and the generated key are there', async () => {
    vi.mocked(db.execute).mockResolvedValue([
      { tables: true, secret: true }
    ] as never)
    await expect(checkHealth()).resolves.toEqual({
      ok: true,
      database: true,
      model: false,
      search: false
    })

    vi.mocked(db.execute).mockResolvedValue([
      { tables: true, secret: false }
    ] as never)
    await expect(checkHealth()).resolves.toMatchObject({ ok: false })
  })

  it('is not ok, and does not throw, when the database is unreachable', async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(checkHealth()).resolves.toEqual({
      ok: false,
      database: false,
      model: false,
      search: false
    })
  })
})
