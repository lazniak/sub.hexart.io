import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import Redis from 'ioredis'
import { CaptionEngine } from '@sub/caption-engine'
import { TOPUP_PACKS, planOf } from '@sub/billing'
import type { SessionConfig } from '@sub/contracts'
import { captionSessions, createDb, glossaries, providerKeys, type Database } from '@sub/db'
import { createRedisJtiStore, importSessionJwtKey } from './auth.js'
import { DRAIN_TIMEOUT_MS, loadConfig, type RelayConfig } from './config.js'
import {
  encryptSecret,
  decryptSecret,
  hashProjectorToken,
  parseEncryptionKey,
  CURRENT_KEY_VERSION,
} from './crypto.js'
import { createLogger, type Logger } from './logger.js'
import { Meter, createLedgerGateway } from './metering.js'
import { ElevenLabsSttClient } from './providers/elevenlabs-stt.js'
import { ElevenLabsTtsClient } from './providers/elevenlabs-tts.js'
import { OpenRouterManagementClient, translate } from './providers/openrouter.js'
import { SessionRegistry } from './registry.js'
import { SessionActor, type SessionActorDeps } from './session-actor.js'
import { createRelayServer, type SessionRequest } from './server.js'

const config = loadConfig()
const logger = createLogger(config.LOG_LEVEL)

const db = createDb(config.DATABASE_URL)
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 })
const encryptionKey = parseEncryptionKey(config.PROVIDER_KEY_ENC_KEY)
const management = new OpenRouterManagementClient(config.OPENROUTER_MANAGEMENT_API_KEY)
const registry = new SessionRegistry<SessionActor>()

/** Rotated per process: IP hashes are only ever correlated inside one relay's logs. */
const ipSalt = randomBytes(16).toString('hex')

const server = createRelayServer({
  config,
  logger,
  registry,
  jwtKey: await importSessionJwtKey(config.SESSION_JWT_PUBLIC_KEY),
  jtiStore: createRedisJtiStore({
    set: (key, value, mode, ttl, condition) => redis.set(key, value, mode, ttl, condition),
    exists: (key) => redis.exists(key),
  }),
  ipSalt,
  createSession: (request) => buildSession(request, { config, logger, db }),
  resolveProjector: (token) => resolveProjectorSession(db, token),
})

await server.listen()

/* ── Graceful shutdown ───────────────────────────────────────────────────────
 * Refuse new sessions, let the running ones finish, then flush. A relay that
 * exits without draining bills nothing for the last interval — which is the
 * direction we accept, but only as a failure mode, never as normal operation.
 */
let shuttingDown = false

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    // A rejection here would be unhandled and would take the process down mid-drain,
    // losing the very ledger flush the drain exists to perform.
    shutdown(signal).catch((error: unknown) => {
      logger.error({ signal, err: String(error) }, 'shutdown failed')
      process.exit(1)
    })
  })
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal, sessions: registry.size }, 'draining relay')

  await server.drain('server_shutdown', DRAIN_TIMEOUT_MS)
  await server.close()
  await redis.quit().catch(() => undefined)

  logger.info('relay stopped')
  process.exit(0)
}

/* ── Projector routing ─────────────────────────────────────────────────────── */

/**
 * Maps an OBS browser source onto the session it is allowed to watch.
 *
 * `/api/session/start` mints the token and stores only its digest, so the lookup
 * is by digest and the relay never holds a working link. Reading the row on every
 * attach — instead of caching the digest for the life of the session — is what
 * makes the panel's "new link" button revoke the old URL the moment it is pressed.
 */
async function resolveProjectorSession(
  database: Database,
  token: string,
): Promise<SessionActor | undefined> {
  const rows = await database
    .select({ id: captionSessions.id })
    .from(captionSessions)
    .where(
      and(
        eq(captionSessions.projectorTokenHash, hashProjectorToken(token)),
        isNull(captionSessions.endedAt),
      ),
    )
    .limit(1)

  const sessionId = rows[0]?.id
  return sessionId === undefined ? undefined : registry.get(sessionId)
}

/* ── Session assembly ──────────────────────────────────────────────────────── */

interface RuntimeDeps {
  config: RelayConfig
  logger: Logger
  db: Database
}

async function buildSession(request: SessionRequest, deps: RuntimeDeps): Promise<SessionActor> {
  const { claims } = request
  const cfg = claims.cfg
  const plan = planOf(claims.plan)
  const userId = claims.sub
  const sessionId = claims.sid

  const gateway = createLedgerGateway({
    db: deps.db,
    redis: {
      get: (key) => redis.get(key),
      incrbyfloat: (key, increment) => redis.incrbyfloat(key, increment),
      expire: (key, seconds) => redis.expire(key, seconds),
    },
    userId,
    sessionId,
  })

  // A zero-credit reservation is a read: it tells us the free balance without
  // taking a hold, so the first `credits` event the studio sees is already true.
  const opening = await gateway.reserve(0)
  const burn = { targetLanguages: cfg.dstLangs.length, voiceEnabled: cfg.voice.enabled }
  const keyterms = await loadGlossaryTerms(deps.db, cfg.glossaryId)
  const runtimeKey = await resolveRuntimeKey(
    deps,
    userId,
    opening.balanceRemaining + claims.reserved,
  )
  const voiceLang = resolveVoiceLang(cfg)

  const actorDeps: SessionActorDeps = {
    sessionId,
    userId,
    // Echoed in `ready` to satisfy `RelayReady`, and nothing more: the token that
    // actually routes a projector is minted by `/api/session/start` and resolved
    // through `caption_sessions.projector_token_hash` (see resolveProjectorSession).
    // `RelayJwtClaims` does not carry it, so the relay cannot repeat the real one;
    // this value grants no access. Aligning the two needs a `contracts` RFC.
    projectorToken: `pt_${randomBytes(32).toString('base64url')}`,
    config: cfg,
    watermark: plan.watermark,
    studio: request.studio,
    engine: new CaptionEngine({
      targetLangs: cfg.dstLangs,
      voiceLang,
      maxCharsPerLine: cfg.render.maxCharsPerLine,
      maxLines: cfg.render.maxLines,
    }),
    translator: {
      translate: (job) =>
        translate({
          apiKey: runtimeKey,
          model: job.speculative
            ? deps.config.OPENROUTER_MODEL_FAST
            : deps.config.OPENROUTER_MODEL_QUALITY,
          srcLang: cfg.srcLang,
          dstLang: job.lang,
          glossary: keyterms,
          context: job.context,
          text: job.text,
        }),
    },
    logger: deps.logger,
    now: () => Date.now(),
    createMeter: (events) =>
      new Meter({
        burn,
        reserved: claims.reserved,
        balanceRemaining: opening.balanceRemaining,
        gateway,
        events,
        now: () => Date.now(),
      }),
    createStt: (handlers) =>
      new ElevenLabsSttClient({
        apiKey: deps.config.ELEVENLABS_API_KEY_STT,
        model: deps.config.ELEVENLABS_STT_MODEL,
        region: deps.config.ELEVENLABS_REGION,
        languageCode: cfg.srcLang === 'auto' ? undefined : cfg.srcLang,
        keyterms,
        noVerbatim: cfg.noVerbatim,
        onEvent: handlers.onEvent,
        onError: handlers.onError,
        now: () => Date.now(),
      }),
    createTts: (handlers) => {
      if (!cfg.voice.enabled || !cfg.voice.voiceId || !voiceLang) return null
      return new ElevenLabsTtsClient({
        apiKey: deps.config.ELEVENLABS_API_KEY_TTS,
        model: deps.config.ELEVENLABS_TTS_MODEL,
        region: deps.config.ELEVENLABS_REGION,
        voiceId: cfg.voice.voiceId,
        lang: voiceLang,
        speed: cfg.voice.speed,
        onAudio: handlers.onAudio,
        onError: handlers.onError,
      })
    },
    onClosed: request.onClosed,
  }

  return new SessionActor(actorDeps)
}

/** The voice reads one target language; without translation it reads the source. */
function resolveVoiceLang(cfg: SessionConfig): string | null {
  if (!cfg.voice.enabled) return null
  return cfg.voice.lang ?? cfg.dstLangs[0] ?? null
}

async function loadGlossaryTerms(db: Database, glossaryId?: string): Promise<string[]> {
  if (!glossaryId) return []
  const rows = await db
    .select({ terms: glossaries.terms })
    .from(glossaries)
    .where(eq(glossaries.id, glossaryId))
    .limit(1)
  return rows[0]?.terms ?? []
}

/**
 * Per-user OpenRouter runtime key.
 *
 * Created on first use, stored encrypted, re-capped as the balance grows. The cap
 * is a ceiling, not a price: it exists so a metering bug stops at the user's own
 * balance instead of at ours (SECURITY.md §4). Rotation is a scheduled job, not
 * something the hot path does.
 */
async function resolveRuntimeKey(
  deps: RuntimeDeps,
  userId: string,
  creditsAvailable: number,
): Promise<string> {
  const limitUsd = providerKeyCeilingUsd(creditsAvailable)

  const existing = await deps.db
    .select({ keyEnc: providerKeys.keyEnc, externalRef: providerKeys.externalRef })
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, 'openrouter')))
    .limit(1)

  const row = existing[0]
  if (row) {
    await management
      .updateRuntimeKey(row.externalRef, { limitUsd })
      .catch((error: unknown) =>
        deps.logger.warn({ err: String(error) }, 'runtime key re-cap failed'),
      )
    return decryptSecret(row.keyEnc, encryptionKey).plaintext
  }

  const created = await management.createRuntimeKey({ name: `u_${userId}`, limitUsd })
  await deps.db.insert(providerKeys).values({
    userId,
    provider: 'openrouter',
    externalRef: created.hash,
    keyEnc: encryptSecret(created.key, encryptionKey),
    keyEncVersion: CURRENT_KEY_VERSION,
    limitUsd: limitUsd.toFixed(4),
  })
  return created.key
}

/**
 * Upper bound in USD for a credit balance.
 *
 * Derived from the most generous published top-up pack, so it always over- rather
 * than under-estimates what the user paid. Deliberately not a price: the ledger in
 * `@sub/billing` remains the only thing that decides what anything costs.
 */
function providerKeyCeilingUsd(credits: number): number {
  const bestRate = TOPUP_PACKS.reduce((best, pack) => {
    const eurPerCredit = pack.price.eur / 100 / pack.credits
    return Math.max(best, eurPerCredit)
  }, 0)
  return Math.max(1, Math.ceil(credits * bestRate))
}
