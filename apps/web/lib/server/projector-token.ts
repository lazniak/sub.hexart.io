import { createHash, randomBytes } from 'node:crypto'
import { publicEnv } from '@/lib/env'

const PREFIX = 'pt_'

export interface ProjectorToken {
  token: string
  hash: string
  url: string
}

/**
 * 32 random bytes behind a `pt_` prefix — not a JWT, because nothing about the
 * account should be inferable from it.
 *
 * This string is pasted into an OBS Browser Source and will eventually appear on
 * somebody's stream. It grants read-only access to one live session and expires
 * with it; the database keeps only the digest, so a leak of the sessions table
 * does not leak working links either. SECURITY.md §3.
 */
export function issueProjectorToken(): ProjectorToken {
  const token = PREFIX + randomBytes(32).toString('base64url')
  return {
    token,
    hash: hashProjectorToken(token),
    url: projectorUrl(token),
  }
}

export function hashProjectorToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function projectorUrl(token: string): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/projector/${token}`
}
