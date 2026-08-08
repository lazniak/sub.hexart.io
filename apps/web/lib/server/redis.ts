import Redis from 'ioredis'
import { serverEnv } from '@/lib/env'

const cache = globalThis as typeof globalThis & { __subRedis?: Redis }

export function redis(): Redis {
  if (!cache.__subRedis) {
    cache.__subRedis = new Redis(serverEnv().REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableAutoPipelining: true,
    })
  }
  return cache.__subRedis
}

export const redisKeys = {
  rateLimit: (scope: string, key: string) => `rl:${scope}:${key}`,
  concurrency: (userId: string) => `conc:${userId}`,
  revokedJwt: (jti: string) => `revoked:${jti}`,
  emailVerification: (tokenHash: string) => `evt:${tokenHash}`,
  passwordReset: (tokenHash: string) => `pwr:${tokenHash}`,
}

/**
 * A relay process that dies mid-session never releases its slot, so the counter
 * carries a ceiling TTL well beyond any plausible stream length.
 */
const CONCURRENCY_SLOT_TTL_SECONDS = 6 * 60 * 60

/** Read-then-increment in one round trip, so two parallel tabs cannot both win. */
const ACQUIRE_SLOT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then return -1 end
local taken = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return taken
`

const RELEASE_SLOT = `
local left = redis.call('DECR', KEYS[1])
if left <= 0 then redis.call('DEL', KEYS[1]) end
return 1
`

/** Returns the slot number taken, or null when the plan limit is already used up. */
export async function acquireConcurrencySlot(
  userId: string,
  limit: number,
): Promise<number | null> {
  const taken = (await redis().eval(
    ACQUIRE_SLOT,
    1,
    redisKeys.concurrency(userId),
    String(limit),
    String(CONCURRENCY_SLOT_TTL_SECONDS),
  )) as number
  return taken < 0 ? null : taken
}

export async function releaseConcurrencySlot(userId: string): Promise<void> {
  await redis().eval(RELEASE_SLOT, 1, redisKeys.concurrency(userId))
}
