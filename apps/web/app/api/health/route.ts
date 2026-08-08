import { sql } from 'drizzle-orm'
import { db } from '@/lib/server/db'
import { redis } from '@/lib/server/redis'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function probe(fn: () => Promise<unknown>): Promise<'ok' | 'down'> {
  try {
    await fn()
    return 'ok'
  } catch {
    return 'down'
  }
}

export async function GET(req: Request) {
  const [database, cache] = await Promise.all([
    probe(() => db().execute(sql`select 1`)),
    probe(() => redis().ping()),
  ])

  const healthy = database === 'ok' && cache === 'ok'
  return json({ status: healthy ? 'ok' : 'degraded', database, cache }, req, {
    status: healthy ? 200 : 503,
  })
}
