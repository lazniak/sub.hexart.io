import { and, eq } from 'drizzle-orm'
import { captionSessions, glossaries } from '@sub/db'
import {
  RESERVATION_WINDOW_SECONDS,
  burnRatePerMinute,
  checkConfigAgainstPlan,
  creditsForSeconds,
  estimateSeconds,
  planOf,
  type BurnConfig,
} from '@sub/billing'
import {
  StartSessionRequest,
  type StartSessionError,
  type StartSessionResponse,
} from '@sub/contracts'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { availableCredits } from '@/lib/server/credits'
import { issueProjectorToken } from '@/lib/server/projector-token'
import { acquireConcurrencySlot, releaseConcurrencySlot } from '@/lib/server/redis'
import { readAuthSession } from '@/lib/auth/session'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { mintRelayJwt } from '@/lib/auth/relay-jwt'
import { publicEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function reject(
  req: Request,
  status: number,
  error: StartSessionError['error'],
  message: string,
  creditsNeeded?: number,
): Response {
  const body: StartSessionError =
    creditsNeeded === undefined ? { error, message } : { error, message, creditsNeeded }
  return json(body, req, { status })
}

/**
 * The only place a session may be authorised.
 *
 * Every gate that costs money is decided here, server-side: plan features,
 * balance, concurrency. The studio UI mirrors these decisions for a nicer
 * experience but has no authority over them — a hand-crafted request gets the
 * same answers.
 */
export async function POST(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const limit = await consumeRateLimit('sessionStart', auth.user.id)
  if (!limit.allowed) {
    return reject(req, 429, 'RATE_LIMITED', 'Zbyt wiele startów sesji w tej godzinie.')
  }

  if (!auth.user.emailVerifiedAt) {
    return reject(req, 403, 'EMAIL_NOT_VERIFIED', 'Potwierdź adres e-mail, żeby uruchomić sesję.')
  }

  const parsed = StartSessionRequest.safeParse(await readJson(req))
  if (!parsed.success) {
    return reject(req, 400, 'INVALID_CONFIG', 'Konfiguracja sesji jest nieprawidłowa.')
  }

  const config = parsed.data.config
  const plan = planOf(auth.user.planCode)
  const burn: BurnConfig = {
    targetLanguages: config.dstLangs.length,
    voiceEnabled: config.voice.enabled,
  }

  const planCheck = checkConfigAgainstPlan(plan, burn)
  if (!planCheck.ok) {
    return reject(
      req,
      403,
      planCheck.reason ?? 'PLAN_FEATURE_LOCKED',
      polishPlanMessage(plan.name, planCheck.reason),
    )
  }

  if (config.glossaryId) {
    if (!plan.glossaryEnabled) {
      return reject(
        req,
        403,
        'PLAN_FEATURE_LOCKED',
        `Glosariusz jest dostępny od planu Creator (obecny: ${plan.name}).`,
      )
    }
    const owned = await db()
      .select({ id: glossaries.id })
      .from(glossaries)
      .where(and(eq(glossaries.id, config.glossaryId), eq(glossaries.userId, auth.user.id)))
      .limit(1)
    if (!owned[0]) return reject(req, 400, 'INVALID_CONFIG', 'Wybrany glosariusz nie istnieje.')
  }

  if (config.voice.enabled && config.voice.lang && !config.dstLangs.includes(config.voice.lang)) {
    return reject(req, 400, 'INVALID_CONFIG', 'Język lektora musi być jednym z języków napisów.')
  }

  const available = await availableCredits(auth.user.id)
  const burnRate = burnRatePerMinute(burn)
  const window = creditsForSeconds(RESERVATION_WINDOW_SECONDS, burn)

  if (available <= 0) {
    return reject(
      req,
      402,
      'INSUFFICIENT_CREDITS',
      'Brak credits. Doładuj konto, żeby uruchomić sesję.',
      window,
    )
  }

  // Reserve at most one window ahead; the relay tops the reservation up as it
  // burns, so a nearly empty balance still buys the seconds it can afford.
  const reserved = Math.min(available, window)

  const slot = await acquireConcurrencySlot(auth.user.id, plan.maxConcurrentSessions)
  if (slot === null) {
    return reject(
      req,
      409,
      'CONCURRENCY_LIMIT',
      `Plan ${plan.name} pozwala na ${plan.maxConcurrentSessions} równoległych sesji.`,
    )
  }

  try {
    const projector = issueProjectorToken()
    const inserted = await db()
      .insert(captionSessions)
      .values({
        userId: auth.user.id,
        srcLang: config.srcLang,
        dstLangs: config.dstLangs,
        voiceEnabled: config.voice.enabled,
        voiceId: config.voice.voiceId ?? null,
        projectorTokenHash: projector.hash,
        burnRatePerMin: String(burnRate),
      })
      .returning({ id: captionSessions.id })

    const sessionId = inserted[0]?.id
    if (!sessionId) throw new Error('caption_session_insert_returned_nothing')

    const minted = await mintRelayJwt({
      userId: auth.user.id,
      sessionId,
      plan: plan.code,
      reserved,
      config,
    })

    const body: StartSessionResponse = {
      sessionId,
      jwt: minted.jwt,
      relayUrl: `${publicEnv.NEXT_PUBLIC_RELAY_WS_URL.replace(/\/$/, '')}/session`,
      projectorToken: projector.token,
      projectorUrl: projector.url,
      burnRatePerMin: burnRate,
      creditsAvailable: available,
      estimatedSeconds: estimateSeconds(available, burn),
    }
    return json(body, req, { status: 201 })
  } catch (err) {
    await releaseConcurrencySlot(auth.user.id)
    console.error('session_start_failed', { userId: auth.user.id, err: String(err) })
    return fail(req, 500, 'INTERNAL', 'Nie udało się uruchomić sesji. Spróbuj ponownie.')
  }
}

function polishPlanMessage(planName: string, reason?: string): string {
  if (reason === 'INVALID_CONFIG') return 'Konfiguracja sesji jest nieprawidłowa.'
  return `Ta konfiguracja wykracza poza plan ${planName}. Zmień ustawienia albo zmień plan.`
}
