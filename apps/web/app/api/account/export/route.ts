import { desc, eq } from 'drizzle-orm'
import {
  billingProfiles,
  captionSessions,
  consents,
  creditLedger,
  glossaries,
  subscriptions,
  users,
} from '@sub/db'
import { db } from '@/lib/server/db'
import { REQUEST_ID_HEADER, fail, requestId } from '@/lib/server/http'
import { clientIpHash } from '@/lib/server/ip'
import { recordAudit } from '@/lib/server/audit'
import { readAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * RODO art. 15/20 self-service export.
 *
 * Everything we hold about the account in one JSON file, delivered immediately
 * rather than through a ticket. Audio and transcripts are absent because they
 * are never stored — SECURITY.md §6.
 */
export async function GET(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const userId = auth.user.id
  const [account, profile, subs, ledger, sessions, glossaryRows, consentRows] = await Promise.all([
    db()
      .select({
        id: users.id,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        planCode: users.planCode,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db().select().from(billingProfiles).where(eq(billingProfiles.userId, userId)).limit(1),
    db().select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    db()
      .select({
        delta: creditLedger.delta,
        reason: creditLedger.reason,
        bucket: creditLedger.bucket,
        sessionId: creditLedger.sessionId,
        expiresAt: creditLedger.expiresAt,
        createdAt: creditLedger.createdAt,
      })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt)),
    db()
      .select({
        id: captionSessions.id,
        srcLang: captionSessions.srcLang,
        dstLangs: captionSessions.dstLangs,
        voiceEnabled: captionSessions.voiceEnabled,
        burnRatePerMin: captionSessions.burnRatePerMin,
        creditsSpent: captionSessions.creditsSpent,
        billableSeconds: captionSessions.billableSeconds,
        endReason: captionSessions.endReason,
        startedAt: captionSessions.startedAt,
        endedAt: captionSessions.endedAt,
      })
      .from(captionSessions)
      .where(eq(captionSessions.userId, userId))
      .orderBy(desc(captionSessions.startedAt)),
    db()
      .select({ name: glossaries.name, terms: glossaries.terms })
      .from(glossaries)
      .where(eq(glossaries.userId, userId)),
    db()
      .select({
        kind: consents.kind,
        documentVersion: consents.documentVersion,
        granted: consents.granted,
        createdAt: consents.createdAt,
      })
      .from(consents)
      .where(eq(consents.userId, userId)),
  ])

  await recordAudit({
    actorUserId: userId,
    action: 'account.export',
    target: userId,
    ipHash: clientIpHash(req.headers),
  })

  const payload = {
    exportedAt: new Date().toISOString(),
    note: 'Audio i transkrypcje nie są przechowywane, dlatego nie występują w tym pliku.',
    account: account[0] ?? null,
    billingProfile: profile[0] ?? null,
    subscriptions: subs,
    creditLedger: ledger,
    sessions,
    glossaries: glossaryRows,
    consents: consentRows,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="sub-hexart-export-${userId}.json"`,
      'cache-control': 'no-store',
      [REQUEST_ID_HEADER]: requestId(req),
    },
  })
}
