import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { captionSessions } from '@sub/db'
import { RotateProjectorTokenResponse } from '@sub/contracts'
import { db } from '@/lib/server/db'
import { fail, json } from '@/lib/server/http'
import { clientIpHash } from '@/lib/server/ip'
import { recordAudit } from '@/lib/server/audit'
import { issueProjectorToken } from '@/lib/server/projector-token'
import { readAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Regenerate the OBS link.
 *
 * The row stores a single token hash, so writing the new digest invalidates the
 * old link in the same statement — there is no window in which both work. That
 * is the whole point of the button: a streamer who just showed the URL on air
 * needs the old one dead now, not at the end of the session.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return fail(req, 400, 'INVALID_INPUT', 'Nieprawidłowy identyfikator sesji.')
  }

  const projector = issueProjectorToken()
  const updated = await db()
    .update(captionSessions)
    .set({ projectorTokenHash: projector.hash })
    .where(
      and(
        eq(captionSessions.id, id),
        eq(captionSessions.userId, auth.user.id),
        isNull(captionSessions.endedAt),
      ),
    )
    .returning({ id: captionSessions.id })

  if (!updated[0]) {
    return fail(req, 404, 'NOT_FOUND', 'Sesja nie istnieje albo już się zakończyła.')
  }

  await recordAudit({
    actorUserId: auth.user.id,
    action: 'session.projector_token_rotated',
    target: id,
    ipHash: clientIpHash(req.headers),
  })

  const body = RotateProjectorTokenResponse.parse({
    projectorToken: projector.token,
    projectorUrl: projector.url,
  })
  return json(body, req)
}
