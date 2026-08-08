import { json } from '@/lib/server/http'
import { destroyAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  await destroyAuthSession()
  return json({ ok: true }, req)
}
