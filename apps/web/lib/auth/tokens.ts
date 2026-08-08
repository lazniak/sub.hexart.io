import { createHash, randomBytes } from 'node:crypto'
import { redis, redisKeys } from '@/lib/server/redis'

const VERIFICATION_TTL_SECONDS = 24 * 60 * 60
/** SECURITY.md §2 — reset links are short-lived and single use. */
const RESET_TTL_SECONDS = 15 * 60

function digest(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function mint(): string {
  return randomBytes(32).toString('base64url')
}

export async function issueEmailVerificationToken(userId: string): Promise<string> {
  const token = mint()
  await redis().set(
    redisKeys.emailVerification(digest(token)),
    userId,
    'EX',
    VERIFICATION_TTL_SECONDS,
  )
  return token
}

/** Single use: the key is deleted in the same round trip that reads it. */
export async function consumeEmailVerificationToken(token: string): Promise<string | null> {
  const key = redisKeys.emailVerification(digest(token))
  const userId = await redis().getdel(key)
  return userId ?? null
}

export async function issuePasswordResetToken(
  userId: string,
  userAgentFamily: string,
): Promise<string> {
  const token = mint()
  await redis().set(
    redisKeys.passwordReset(digest(token)),
    `${userId}:${userAgentFamily}`,
    'EX',
    RESET_TTL_SECONDS,
  )
  return token
}

/**
 * Bound to the user-agent family the request came from, so a link harvested out
 * of a mailbox on another device does not open the account.
 */
export async function consumePasswordResetToken(
  token: string,
  userAgentFamily: string,
): Promise<string | null> {
  const key = redisKeys.passwordReset(digest(token))
  const stored = await redis().getdel(key)
  if (!stored) return null
  const separator = stored.lastIndexOf(':')
  const userId = stored.slice(0, separator)
  const family = stored.slice(separator + 1)
  if (family !== userAgentFamily) return null
  return userId
}
