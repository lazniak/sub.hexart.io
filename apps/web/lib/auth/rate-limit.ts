import { redis, redisKeys } from '@/lib/server/redis'

export interface RateLimitRule {
  limit: number
  windowSeconds: number
}

/**
 * SECURITY.md §5. The last two entries are enforced inside the relay process,
 * not here — they live in this table so there is one place to read the numbers.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 10 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  passwordReset: { limit: 3, windowSeconds: 60 * 60 },
  sessionStart: { limit: 20, windowSeconds: 60 * 60 },
  relayHandshake: { limit: 30, windowSeconds: 60 },
  audioFrames: { limit: 60, windowSeconds: 1 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Sliding window over a sorted set: drop everything older than the window, count
 * what is left, admit and record only if there is room. Fixed buckets would let
 * an attacker fire 2× the limit across a bucket boundary.
 */
const SLIDING_WINDOW = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
local used = redis.call('ZCARD', KEYS[1])
if used >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = (tonumber(oldest[2]) + window) - now end
  return { 0, 0, retry }
end
redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window)
return { 1, limit - used - 1, 0 }
`

export async function consumeRateLimit(name: RateLimitName, key: string): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name]
  const raw = (await redis().eval(
    SLIDING_WINDOW,
    1,
    redisKeys.rateLimit(name, key),
    String(Date.now()),
    String(rule.windowSeconds * 1000),
    String(rule.limit),
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )) as [number, number, number]

  return {
    allowed: raw[0] === 1,
    remaining: raw[1],
    retryAfterSeconds: Math.max(1, Math.ceil(raw[2] / 1000)),
  }
}
