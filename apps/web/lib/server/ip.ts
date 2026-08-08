import { createHash } from 'node:crypto'
import { serverEnv } from '@/lib/env'

/**
 * Raw addresses never leave this module.
 *
 * SECURITY.md §6: IP addresses are stored and logged only as a salted hash. The
 * plain value exists just long enough to be keyed for rate limiting, which
 * happens in memory and in Redis under an already-hashed key.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() ?? 'unknown'
}

export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(`${serverEnv().IP_HASH_SALT}:${ip}`)
    .digest('base64url')
    .slice(0, 32)
}

/** Convenience for the common case: hash straight from the request headers. */
export function clientIpHash(headers: Headers): string {
  return hashIp(clientIp(headers))
}

/**
 * Coarse user-agent family, used to bind password-reset tokens. Deliberately
 * lossy — it must not become a fingerprint.
 */
export function userAgentFamily(headers: Headers): string {
  const ua = headers.get('user-agent') ?? ''
  if (/edg\//i.test(ua)) return 'edge'
  if (/opr\//i.test(ua)) return 'opera'
  if (/chrome\//i.test(ua)) return 'chrome'
  if (/firefox\//i.test(ua)) return 'firefox'
  if (/safari\//i.test(ua)) return 'safari'
  return 'other'
}
