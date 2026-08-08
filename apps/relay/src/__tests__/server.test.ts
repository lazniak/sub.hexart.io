import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { SignJWT, exportSPKI, generateKeyPair } from 'jose'
import { WebSocket } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { CaptionEngine } from '@sub/caption-engine'
import {
  PROTOCOL_VERSION,
  RELAY_JWT_AUDIENCE,
  SessionConfig,
  encodeAudioFrame,
  type RelayMessage,
} from '@sub/contracts'
import { importSessionJwtKey, type JtiStore } from '../auth.js'
import type { RelayConfig } from '../config.js'
import { createLogger } from '../logger.js'
import { Meter, type MeterGateway } from '../metering.js'
import { SessionRegistry } from '../registry.js'
import { SessionActor } from '../session-actor.js'
import {
  CLOSE_NOT_FOUND,
  createRelayServer,
  type RelayServer,
  type RelayServerDeps,
} from '../server.js'

/**
 * Front-door regressions.
 *
 * Both cases below shipped broken once: audio arriving while the handshake was
 * still in flight killed the session, and the projector token was resolved from a
 * value the relay had invented rather than the one the web app minted. Neither is
 * visible from a unit test of the actor — they only exist at the socket boundary.
 */

const gateway: MeterGateway = {
  async reserve(amount) {
    return { granted: amount, balanceRemaining: 100 }
  },
  async flush() {},
  async release() {},
}

function memoryJtiStore(): JtiStore {
  const used = new Set<string>()
  return {
    async claim(jti) {
      if (used.has(jti)) return false
      used.add(jti)
      return true
    },
    async isRevoked() {
      return false
    },
  }
}

const relayConfig = { RELAY_PORT: 0, LOG_LEVEL: 'silent' } as unknown as RelayConfig

interface Harness {
  server: RelayServer
  port: number
  registry: SessionRegistry<SessionActor>
  jwt(): Promise<string>
  /** What the projector token resolver will accept. Reassign to simulate a rotation. */
  setProjectorToken(token: string | null): void
  sessionId: string
  handshakeDelayMs: number
  setHandshakeDelay(ms: number): void
}

async function startHarness(): Promise<Harness> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  const registry = new SessionRegistry<SessionActor>()
  const sessionId = randomUUID()
  const userId = randomUUID()
  const logger = createLogger('silent')

  let acceptedToken: string | null = 'pt_web_minted_0123456789'
  let handshakeDelayMs = 0

  const deps: RelayServerDeps = {
    config: relayConfig,
    logger,
    registry,
    jwtKey: await importSessionJwtKey(await exportSPKI(publicKey)),
    jtiStore: memoryJtiStore(),
    ipSalt: 'test-salt',
    async createSession(request) {
      // Stands in for the Postgres and Redis round-trips the real factory makes.
      if (handshakeDelayMs > 0) await new Promise((r) => setTimeout(r, handshakeDelayMs))
      return new SessionActor({
        sessionId: request.claims.sid,
        userId: request.claims.sub,
        projectorToken: 'pt_relay_local_0123456789',
        config: request.claims.cfg,
        watermark: false,
        studio: request.studio,
        engine: new CaptionEngine({ targetLangs: [], voiceLang: null }),
        translator: { translate: async () => '' },
        logger,
        now: () => Date.now(),
        createMeter: (events) =>
          new Meter({
            burn: { targetLanguages: 0, voiceEnabled: false },
            reserved: 10,
            balanceRemaining: 100,
            gateway,
            events,
            now: () => Date.now(),
          }),
        createStt: () => ({
          start: () => undefined,
          sendAudio: () => undefined,
          commit: () => undefined,
          close: () => undefined,
        }),
        createTts: () => null,
        onClosed: request.onClosed,
        setTicker: () => 0,
        clearTicker: () => undefined,
      })
    },
    async resolveProjector(token) {
      return acceptedToken !== null && token === acceptedToken ? registry.get(sessionId) : undefined
    },
  }

  const server = createRelayServer(deps)
  await server.listen()
  const address = server.httpServer.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  return {
    server,
    port,
    registry,
    sessionId,
    get handshakeDelayMs() {
      return handshakeDelayMs
    },
    setHandshakeDelay(ms) {
      handshakeDelayMs = ms
    },
    setProjectorToken(token) {
      acceptedToken = token
    },
    async jwt() {
      return new SignJWT({
        sub: userId,
        sid: sessionId,
        jti: randomUUID(),
        plan: 'pro',
        reserved: 10,
        cfg: SessionConfig.parse({}),
      })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setAudience(RELAY_JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('60s')
        .sign(privateKey)
    },
  }
}

const open: WebSocket[] = []

function connect(port: number, path: string): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
  open.push(ws)
  return ws
}

function nextMessage(ws: WebSocket): Promise<RelayMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data: Buffer) => resolve(JSON.parse(data.toString('utf8')) as RelayMessage))
    ws.once('close', (code: number) => reject(new Error(`closed ${code}`)))
  })
}

function nextClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.once('close', (code: number) => resolve(code)))
}

let harness: Harness | null = null

afterEach(async () => {
  for (const ws of open.splice(0)) ws.terminate()
  await harness?.server.close()
  harness = null
})

describe('studio handshake', () => {
  it('does not kill the session when audio arrives while the handshake is still in flight', async () => {
    harness = await startHarness()
    // The studio opens its microphone the moment `hello` goes out; the relay is
    // still verifying the JWT and reading Postgres when the first frames land.
    harness.setHandshakeDelay(80)

    const ws = connect(harness.port, '/session')
    await once(ws, 'open')

    ws.send(
      JSON.stringify({
        t: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        jwt: await harness.jwt(),
        config: SessionConfig.parse({}),
      }),
    )
    for (let i = 0; i < 5; i += 1) {
      ws.send(encodeAudioFrame(i, new Uint8Array(640)), { binary: true })
    }

    const first = await nextMessage(ws)
    expect(first.t).toBe('ready')
    expect(ws.readyState).toBe(WebSocket.OPEN)
  })

  it('still rejects audio sent before any hello', async () => {
    harness = await startHarness()
    const ws = connect(harness.port, '/session')
    await once(ws, 'open')

    ws.send(encodeAudioFrame(0, new Uint8Array(640)), { binary: true })

    expect(await nextClose(ws)).toBe(4008)
  })

  it('accepts the /studio path as well as the /session path the web app dials', async () => {
    harness = await startHarness()
    const ws = connect(harness.port, '/studio')
    await once(ws, 'open')

    ws.send(
      JSON.stringify({
        t: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        jwt: await harness.jwt(),
        config: SessionConfig.parse({}),
      }),
    )

    expect((await nextMessage(ws)).t).toBe('ready')
  })
})

describe('projector token', () => {
  async function startSession(h: Harness): Promise<void> {
    const studio = connect(h.port, '/session')
    await once(studio, 'open')
    studio.send(
      JSON.stringify({
        t: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        jwt: await h.jwt(),
        config: SessionConfig.parse({}),
      }),
    )
    await nextMessage(studio)
  }

  it('attaches on the token the web app minted, not one the relay invented', async () => {
    harness = await startHarness()
    await startSession(harness)

    const projector = connect(harness.port, '/projector')
    await once(projector, 'open')
    projector.send(
      JSON.stringify({
        t: 'attach',
        protocolVersion: PROTOCOL_VERSION,
        token: 'pt_web_minted_0123456789',
        role: 'captions',
      }),
    )

    expect((await nextMessage(projector)).t).toBe('snapshot')
  })

  it('refuses the relay-local token announced in ready — it grants nothing', async () => {
    harness = await startHarness()
    await startSession(harness)

    const projector = connect(harness.port, '/projector')
    await once(projector, 'open')
    projector.send(
      JSON.stringify({
        t: 'attach',
        protocolVersion: PROTOCOL_VERSION,
        token: 'pt_relay_local_0123456789',
        role: 'captions',
      }),
    )

    expect(await nextClose(projector)).toBe(CLOSE_NOT_FOUND)
  })

  /** SECURITY.md §3: "Wygeneruj nowy link" must kill the old URL immediately. */
  it('stops accepting a rotated token without waiting for the session to end', async () => {
    harness = await startHarness()
    await startSession(harness)
    harness.setProjectorToken('pt_web_rotated_0123456789')

    const projector = connect(harness.port, '/projector')
    await once(projector, 'open')
    projector.send(
      JSON.stringify({
        t: 'attach',
        protocolVersion: PROTOCOL_VERSION,
        token: 'pt_web_minted_0123456789',
        role: 'captions',
      }),
    )

    expect(await nextClose(projector)).toBe(CLOSE_NOT_FOUND)
  })
})
