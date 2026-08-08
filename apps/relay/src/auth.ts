import { errors, importSPKI, jwtVerify } from 'jose'
import {
  RELAY_JWT_AUDIENCE,
  RELAY_JWT_TTL_SECONDS,
  RelayJwtClaims,
  isProtocolSupported,
} from '@sub/contracts'

/**
 * Session JWT verification.
 *
 * SECURITY.md T9: the token is EdDSA, audience `relay`, lives 60 s and is single
 * use. "Single use" is enforced here and nowhere else — a `SET NX` against Redis
 * is the only thing standing between a captured token and a free session.
 */

export type AuthFailure =
  | 'MALFORMED'
  | 'BAD_SIGNATURE'
  | 'BAD_AUDIENCE'
  | 'EXPIRED'
  | 'BAD_CLAIMS'
  | 'REVOKED'
  | 'REPLAYED'
  | 'PROTOCOL_UNSUPPORTED'

export class AuthError extends Error {
  constructor(
    readonly reason: AuthFailure,
    message?: string,
  ) {
    super(message ?? reason)
    this.name = 'AuthError'
  }
}

export type SessionJwtKey = Awaited<ReturnType<typeof importSPKI>>

/** Accepts a PEM block or the same block base64-encoded, which is how SOPS ships it. */
export async function importSessionJwtKey(publicKey: string): Promise<SessionJwtKey> {
  const pem = publicKey.includes('BEGIN')
    ? publicKey
    : Buffer.from(publicKey, 'base64').toString('utf8')
  if (!pem.includes('BEGIN')) throw new AuthError('MALFORMED', 'session JWT public key is not SPKI')
  return importSPKI(pem.replace(/\\n/g, '\n'), 'EdDSA')
}

/**
 * The slice of Redis auth needs. Narrow on purpose: the tests drive it with a
 * plain object instead of standing up a server.
 */
export interface JtiStore {
  /** True when this `jti` had never been claimed before. */
  claim(jti: string, ttlSeconds: number): Promise<boolean>
  isRevoked(jti: string): Promise<boolean>
}

export interface RedisJtiCommands {
  set(key: string, value: string, mode: 'EX', ttl: number, condition: 'NX'): Promise<'OK' | null>
  exists(key: string): Promise<number>
}

export function createRedisJtiStore(redis: RedisJtiCommands): JtiStore {
  return {
    async claim(jti, ttlSeconds) {
      const result = await redis.set(`used:${jti}`, '1', 'EX', ttlSeconds, 'NX')
      return result === 'OK'
    },
    async isRevoked(jti) {
      return (await redis.exists(`revoked:${jti}`)) > 0
    },
  }
}

export interface VerifySessionJwtOptions {
  key: SessionJwtKey
  jtiStore: JtiStore
  /** Small tolerance for clock skew between the web app and the relay host. */
  clockToleranceSeconds?: number
}

export async function verifySessionJwt(
  token: string,
  options: VerifySessionJwtOptions,
): Promise<RelayJwtClaims> {
  const { payload } = await verifySignature(token, options)

  const claims = RelayJwtClaims.safeParse(payload)
  if (!claims.success) throw new AuthError('BAD_CLAIMS', 'session JWT claims failed validation')

  // Revocation beats replay: an explicitly killed token must never look merely reused.
  if (await options.jtiStore.isRevoked(claims.data.jti)) {
    throw new AuthError('REVOKED', 'session JWT was revoked')
  }

  // Keep the marker alive past the token itself so a replay after expiry still trips here.
  const ttl = RELAY_JWT_TTL_SECONDS + (options.clockToleranceSeconds ?? 5) * 2
  if (!(await options.jtiStore.claim(claims.data.jti, ttl))) {
    throw new AuthError('REPLAYED', 'session JWT was already used')
  }

  return claims.data
}

export function assertProtocolSupported(version: string): void {
  if (!isProtocolSupported(version)) {
    throw new AuthError('PROTOCOL_UNSUPPORTED', `unsupported protocol version ${version}`)
  }
}

async function verifySignature(token: string, options: VerifySessionJwtOptions) {
  try {
    return await jwtVerify(token, options.key, {
      audience: RELAY_JWT_AUDIENCE,
      algorithms: ['EdDSA'],
      clockTolerance: options.clockToleranceSeconds ?? 5,
    })
  } catch (error) {
    throw new AuthError(classify(error), 'session JWT rejected')
  }
}

function classify(error: unknown): AuthFailure {
  if (error instanceof errors.JWTExpired) return 'EXPIRED'
  if (error instanceof errors.JWTClaimValidationFailed) {
    return error.claim === 'aud' ? 'BAD_AUDIENCE' : 'BAD_CLAIMS'
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) return 'BAD_SIGNATURE'
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) return 'MALFORMED'
  return 'MALFORMED'
}
