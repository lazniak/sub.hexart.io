import { SignJWT, exportSPKI, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, RELAY_JWT_AUDIENCE } from '@sub/contracts'
import {
  AuthError,
  assertProtocolSupported,
  importSessionJwtKey,
  verifySessionJwt,
  type JtiStore,
  type SessionJwtKey,
} from '../auth.js'

/** In-memory stand-in for Redis. Single use is the property under test. */
function memoryJtiStore(revoked: string[] = []): JtiStore {
  const used = new Set<string>()
  return {
    async claim(jti) {
      if (used.has(jti)) return false
      used.add(jti)
      return true
    },
    async isRevoked(jti) {
      return revoked.includes(jti)
    },
  }
}

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let publicKey: SessionJwtKey

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA')
  privateKey = pair.privateKey
  publicKey = await importSessionJwtKey(await exportSPKI(pair.publicKey))
})

interface TokenOverrides {
  audience?: string
  expiresInSeconds?: number
  jti?: string
  reserved?: number
}

async function mintToken(overrides: TokenOverrides = {}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresIn = overrides.expiresInSeconds ?? 60
  return new SignJWT({
    sub: '11111111-1111-4111-8111-111111111111',
    sid: '22222222-2222-4222-8222-222222222222',
    jti: overrides.jti ?? 'jti-1',
    plan: 'creator',
    reserved: overrides.reserved ?? 5,
    cfg: {},
    iat: nowSeconds,
    exp: nowSeconds + expiresIn,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setAudience(overrides.audience ?? RELAY_JWT_AUDIENCE)
    .sign(privateKey)
}

describe('verifySessionJwt', () => {
  it('accepts a well formed token and fills the config defaults', async () => {
    const claims = await verifySessionJwt(await mintToken(), {
      key: publicKey,
      jtiStore: memoryJtiStore(),
    })

    expect(claims.aud).toBe('relay')
    expect(claims.plan).toBe('creator')
    expect(claims.cfg.noVerbatim).toBe(true)
    expect(claims.cfg.dstLangs).toEqual([])
  })

  it('rejects a token minted for another audience', async () => {
    const token = await mintToken({ audience: 'web' })
    await expect(
      verifySessionJwt(token, { key: publicKey, jtiStore: memoryJtiStore() }),
    ).rejects.toMatchObject({ reason: 'BAD_AUDIENCE' })
  })

  it('rejects an expired token', async () => {
    const token = await mintToken({ expiresInSeconds: -120 })
    await expect(
      verifySessionJwt(token, { key: publicKey, jtiStore: memoryJtiStore() }),
    ).rejects.toMatchObject({ reason: 'EXPIRED' })
  })

  it('rejects a replayed jti — the token opens exactly one session', async () => {
    const store = memoryJtiStore()
    const token = await mintToken({ jti: 'jti-replay' })

    await expect(verifySessionJwt(token, { key: publicKey, jtiStore: store })).resolves.toBeTruthy()
    await expect(
      verifySessionJwt(token, { key: publicKey, jtiStore: store }),
    ).rejects.toMatchObject({ reason: 'REPLAYED' })
  })

  it('reports revocation ahead of replay', async () => {
    const token = await mintToken({ jti: 'jti-revoked' })
    await expect(
      verifySessionJwt(token, { key: publicKey, jtiStore: memoryJtiStore(['jti-revoked']) }),
    ).rejects.toMatchObject({ reason: 'REVOKED' })
  })

  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('EdDSA')
    const foreign = await importSessionJwtKey(await exportSPKI(other.publicKey))
    await expect(
      verifySessionJwt(await mintToken(), { key: foreign, jtiStore: memoryJtiStore() }),
    ).rejects.toMatchObject({ reason: 'BAD_SIGNATURE' })
  })

  it('rejects garbage', async () => {
    await expect(
      verifySessionJwt('not-a-token', { key: publicKey, jtiStore: memoryJtiStore() }),
    ).rejects.toBeInstanceOf(AuthError)
  })
})

describe('assertProtocolSupported', () => {
  it('accepts the current protocol version', () => {
    expect(() => assertProtocolSupported(PROTOCOL_VERSION)).not.toThrow()
  })

  it('rejects a version outside the compatibility window', () => {
    expect(() => assertProtocolSupported('2.0.0')).toThrow(AuthError)
  })
})
