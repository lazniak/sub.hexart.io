import { randomUUID } from 'node:crypto'
import { SignJWT, importPKCS8, type KeyLike } from 'jose'
import {
  RELAY_JWT_AUDIENCE,
  RELAY_JWT_TTL_SECONDS,
  type RelayJwtClaims,
  type SessionConfig,
} from '@sub/contracts'
import { serverEnv } from '@/lib/env'

const ALG = 'EdDSA'

let cachedKey: KeyLike | null = null

async function signingKey(): Promise<KeyLike> {
  if (cachedKey) return cachedKey
  const raw = serverEnv().SESSION_JWT_PRIVATE_KEY
  // Deployment tooling sometimes base64s the PEM to survive single-line env vars.
  const pem = raw.includes('-----BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  cachedKey = (await importPKCS8(pem.replace(/\\n/g, '\n'), ALG)) as KeyLike
  return cachedKey
}

export interface MintRelayJwtInput {
  userId: string
  sessionId: string
  plan: string
  reserved: number
  config: SessionConfig
}

export interface MintedRelayJwt {
  jwt: string
  jti: string
  expiresAt: number
}

/**
 * 60 seconds, single use, audience `relay`.
 *
 * The token authorises opening exactly one relay session and nothing else, so a
 * copy lifted from a screen share is worthless before it can be pasted anywhere.
 * The studio keeps it in memory only — never in storage. SECURITY.md §3.
 */
export async function mintRelayJwt(input: MintRelayJwtInput): Promise<MintedRelayJwt> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + RELAY_JWT_TTL_SECONDS
  const jti = randomUUID()

  const claims: RelayJwtClaims = {
    sub: input.userId,
    sid: input.sessionId,
    aud: RELAY_JWT_AUDIENCE,
    jti,
    plan: input.plan,
    reserved: input.reserved,
    cfg: input.config,
    iat: now,
    exp,
  }

  const jwt = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .sign(await signingKey())

  return { jwt, jti, expiresAt: exp * 1000 }
}
