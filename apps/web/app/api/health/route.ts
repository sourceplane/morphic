import { checkHealth } from '@/lib/health'

// The deploy's smoke test: 200 with ok:true only when the Worker reaches a
// migrated database through Hyperdrive (lib/health.ts). Never cached.
export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await checkHealth()
  return Response.json(health, {
    status: health.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' }
  })
}
