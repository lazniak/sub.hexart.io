import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { planOf } from '@sub/billing'
import {
  ProjectorMessage,
  StudioMessage,
  decodeAudioFrame,
  type EndReason,
  type RelayJwtClaims,
} from '@sub/contracts'
import {
  AuthError,
  assertProtocolSupported,
  verifySessionJwt,
  type JtiStore,
  type SessionJwtKey,
} from './auth.js'
import {
  HANDSHAKE_TIMEOUT_MS,
  MAX_HANDSHAKES_PER_IP_PER_MINUTE,
  type RelayConfig,
} from './config.js'
import { ipFingerprint, type Logger } from './logger.js'
import type { SessionRegistry } from './registry.js'
import type { OutboundSocket, ProjectorRole, SessionActor } from './session-actor.js'

/**
 * WebSocket front door.
 *
 * Two routes, two trust levels. `/studio` carries a single-use session JWT and may
 * push audio; `/projector` carries an opaque read-only token, may push nothing and
 * receives only what the allowlist permits.
 */

export const CLOSE_AUTH_FAILED = 4001
export const CLOSE_NOT_FOUND = 4004
export const CLOSE_PROTOCOL_ERROR = 4008
export const CLOSE_CONCURRENCY_LIMIT = 4009
export const CLOSE_RATE_LIMITED = 4029
export const CLOSE_DRAINING = 1013

export interface SessionRequest {
  claims: RelayJwtClaims
  studio: OutboundSocket
  onClosed(sessionId: string): void
}

export type SessionFactory = (request: SessionRequest) => Promise<SessionActor>

export interface RelayServerDeps {
  config: RelayConfig
  logger: Logger
  registry: SessionRegistry<SessionActor>
  jwtKey: SessionJwtKey
  jtiStore: JtiStore
  createSession: SessionFactory
  /**
   * Resolves an opaque projector token to a live session.
   *
   * The token is minted by the web app and only its digest is stored, so the
   * relay cannot hold a copy: it hashes what the browser source presents and
   * asks the sessions table. Going through the table on every attach is also
   * what makes "Wygeneruj nowy link" (SECURITY.md §3) take effect immediately —
   * a cached token would keep a revoked OBS link alive for the whole session.
   */
  resolveProjector: (token: string) => Promise<SessionActor | undefined>
  /** Salt for hashing client IPs; raw addresses never reach a log line. */
  ipSalt: string
  now?: () => number
}

export interface RelayServer {
  listen(): Promise<void>
  drain(reason: EndReason, timeoutMs: number): Promise<void>
  close(): Promise<void>
  readonly draining: boolean
  readonly httpServer: Server
}

export function createRelayServer(deps: RelayServerDeps): RelayServer {
  const now = deps.now ?? (() => Date.now())
  const limiter = new HandshakeLimiter(MAX_HANDSHAKES_PER_IP_PER_MINUTE, now)
  const studioWss = new WebSocketServer({ noServer: true })
  const projectorWss = new WebSocketServer({ noServer: true })

  let draining = false

  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(draining ? 503 : 200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ status: draining ? 'draining' : 'ok', sessions: deps.registry.size }),
      )
      return
    }
    res.writeHead(404).end()
  })

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(req.url ?? '/', 'http://relay.local').pathname
    const target = isStudioPath(path) ? studioWss : path === '/projector' ? projectorWss : null
    if (!target) {
      socket.destroy()
      return
    }
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req))
  })

  studioWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleStudio(ws, req, deps, { now, limiter, isDraining: () => draining })
  })

  projectorWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleProjector(ws, req, deps, { now, limiter })
  })

  return {
    get draining() {
      return draining
    },
    httpServer,
    listen() {
      return new Promise((resolve) => {
        httpServer.listen(deps.config.RELAY_PORT, () => {
          deps.logger.info({ port: deps.config.RELAY_PORT }, 'relay listening')
          resolve()
        })
      })
    },
    /**
     * Refuse new sessions, let the running ones finish. A live broadcast is not
     * something we interrupt for a deploy.
     */
    async drain(reason, timeoutMs) {
      draining = true
      const deadline = now() + timeoutMs
      while (deps.registry.size > 0 && now() < deadline) {
        await sleep(500)
      }
      if (deps.registry.size > 0) {
        deps.logger.warn({ remaining: deps.registry.size }, 'drain deadline reached, closing')
        await deps.registry.closeAll(reason)
      }
    },
    async close() {
      draining = true
      studioWss.close()
      projectorWss.close()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    },
  }
}

/**
 * Studio upgrade paths.
 *
 * `/api/session/start` hands the studio `${NEXT_PUBLIC_RELAY_WS_URL}/session` as
 * its `relayUrl`, so that is the path a browser actually dials; `/studio` is the
 * name used in the relay's own docs and deploy notes. Both are accepted rather
 * than picking one and breaking a deployed client.
 */
export const STUDIO_PATHS = ['/session', '/studio'] as const

function isStudioPath(path: string): boolean {
  return (STUDIO_PATHS as readonly string[]).includes(path)
}

interface ConnectionContext {
  now(): number
  limiter: HandshakeLimiter
  isDraining?(): boolean
}

function handleStudio(
  ws: WebSocket,
  req: IncomingMessage,
  deps: RelayServerDeps,
  ctx: ConnectionContext,
): void {
  const ipHash = ipFingerprint(clientIp(req), deps.ipSalt)

  if (ctx.isDraining?.()) {
    ws.close(CLOSE_DRAINING, 'relay draining')
    return
  }
  if (!ctx.limiter.allow(ipHash)) {
    ws.close(CLOSE_RATE_LIMITED, 'too many handshakes')
    return
  }

  const studio = toOutbound(ws)
  let actor: SessionActor | null = null
  let handshakeDone = false

  const timer = setTimeout(() => {
    if (!handshakeDone) ws.close(CLOSE_PROTOCOL_ERROR, 'handshake timeout')
  }, HANDSHAKE_TIMEOUT_MS)

  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      // `hello` is answered asynchronously (signature, Redis, Postgres) while the
      // studio is already streaming 50 frames a second. Frames that land in that
      // window are dropped, never treated as a protocol violation — closing the
      // socket here would kill every session at start-up. Only audio sent before
      // any `hello` at all is a violation.
      if (!actor) {
        if (!handshakeDone) ws.close(CLOSE_PROTOCOL_ERROR, 'audio before handshake')
        return
      }
      const frame = decodeAudioFrame(toBytes(data))
      if (frame) actor.onAudioFrame(frame)
      return
    }

    const parsed = StudioMessage.safeParse(safeJson(rawToString(data)))
    if (!parsed.success) {
      ws.close(CLOSE_PROTOCOL_ERROR, 'malformed control message')
      return
    }

    if (!handshakeDone) {
      if (parsed.data.t !== 'hello') {
        ws.close(CLOSE_PROTOCOL_ERROR, 'expected hello')
        return
      }
      handshakeDone = true
      clearTimeout(timer)
      void completeStudioHandshake(parsed.data.protocolVersion, parsed.data.jwt, {
        deps,
        ipHash,
        studio,
        ws,
        onActor: (created) => {
          actor = created
        },
      })
      return
    }

    actor?.onStudioMessage(parsed.data)
  })

  ws.on('close', () => {
    clearTimeout(timer)
    void actor?.close('user')
  })

  ws.on('error', (error: Error) => {
    deps.logger.warn({ ipHash, err: String(error) }, 'studio socket error')
  })
}

interface HandshakeContext {
  deps: RelayServerDeps
  ipHash: string
  studio: OutboundSocket
  ws: WebSocket
  onActor(actor: SessionActor): void
}

async function completeStudioHandshake(
  protocolVersion: string,
  jwt: string,
  ctx: HandshakeContext,
): Promise<void> {
  const { deps } = ctx
  try {
    assertProtocolSupported(protocolVersion)
    const claims = await verifySessionJwt(jwt, { key: deps.jwtKey, jtiStore: deps.jtiStore })

    // The plan gate is enforced against what this process is actually running.
    const plan = planOf(claims.plan)
    if (deps.registry.activeFor(claims.sub) >= plan.maxConcurrentSessions) {
      ctx.ws.close(CLOSE_CONCURRENCY_LIMIT, 'concurrent session limit reached')
      return
    }

    const actor = await deps.createSession({
      claims,
      studio: ctx.studio,
      onClosed: (sessionId) => deps.registry.unregister(sessionId),
    })
    deps.registry.register(actor)
    ctx.onActor(actor)
    actor.start()

    deps.logger.info(
      { sessionId: actor.sessionId, ipHash: ctx.ipHash, plan: claims.plan },
      'session started',
    )
  } catch (error) {
    const reason = error instanceof AuthError ? error.reason : 'INTERNAL'
    deps.logger.warn({ ipHash: ctx.ipHash, reason }, 'studio handshake rejected')
    ctx.ws.close(CLOSE_AUTH_FAILED, reason)
  }
}

function handleProjector(
  ws: WebSocket,
  req: IncomingMessage,
  deps: RelayServerDeps,
  ctx: ConnectionContext,
): void {
  const ipHash = ipFingerprint(clientIp(req), deps.ipSalt)
  if (!ctx.limiter.allow(ipHash)) {
    ws.close(CLOSE_RATE_LIMITED, 'too many handshakes')
    return
  }

  const socket = toOutbound(ws)
  let attached: {
    actor: SessionActor
    handle: ReturnType<SessionActor['attachProjector']>
  } | null = null
  let attaching = false
  let disposed = false

  const timer = setTimeout(() => {
    if (!attached) ws.close(CLOSE_PROTOCOL_ERROR, 'attach timeout')
  }, HANDSHAKE_TIMEOUT_MS)

  ws.on('message', (data: RawData) => {
    const parsed = ProjectorMessage.safeParse(safeJson(rawToString(data)))
    if (!parsed.success) {
      ws.close(CLOSE_PROTOCOL_ERROR, 'malformed projector message')
      return
    }

    if (parsed.data.t === 'ping') {
      socket.send(JSON.stringify({ t: 'pong' }))
      return
    }

    if (attached || attaching) return
    clearTimeout(timer)

    try {
      assertProtocolSupported(parsed.data.protocolVersion)
    } catch {
      ws.close(CLOSE_PROTOCOL_ERROR, 'unsupported protocol version')
      return
    }

    attaching = true
    const { token, role, lastSeq } = parsed.data
    void (async () => {
      let actor: SessionActor | undefined
      try {
        actor = await deps.resolveProjector(token)
      } catch (error) {
        deps.logger.warn({ ipHash, err: String(error) }, 'projector token lookup failed')
      }
      attaching = false

      // Same response for an unknown token, a rotated one and a finished session:
      // the projector link is public by nature and must not confirm what exists.
      if (!actor) {
        ws.close(CLOSE_NOT_FOUND, 'no such session')
        return
      }
      // The socket may have gone away while Postgres was answering.
      if (disposed) return

      const handle = actor.attachProjector(socket, role as ProjectorRole, lastSeq)
      attached = { actor, handle }
    })()
  })

  ws.on('close', () => {
    disposed = true
    clearTimeout(timer)
    if (attached) attached.actor.detachProjector(attached.handle)
  })

  ws.on('error', (error: Error) => {
    deps.logger.warn({ ipHash, err: String(error) }, 'projector socket error')
  })
}

/** Sliding window over hashed IPs. Redis owns the account-scoped limits. */
export class HandshakeLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly now: () => number,
  ) {}

  allow(key: string): boolean {
    const cutoff = this.now() - 60_000
    const recent = (this.hits.get(key) ?? []).filter((at) => at > cutoff)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(this.now())
    this.hits.set(key, recent)
    return true
  }
}

function toOutbound(ws: WebSocket): OutboundSocket {
  return {
    send(payload) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload)
    },
    close(code, reason) {
      if (ws.readyState === WebSocket.CLOSED) return
      ws.close(code, reason)
    },
  }
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return (first ?? req.socket.remoteAddress ?? 'unknown').trim()
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data as ArrayBuffer).toString('utf8')
}

function toBytes(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (Array.isArray(data)) {
    const joined = Buffer.concat(data)
    return new Uint8Array(joined.buffer, joined.byteOffset, joined.byteLength)
  }
  return new Uint8Array(data as ArrayBuffer)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
