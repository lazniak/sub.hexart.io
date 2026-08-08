import { z } from 'zod'

/**
 * Server environment.
 *
 * Provider keys deliberately do NOT appear here — they live only in the relay
 * process. Anything readable from this module is server-side but still inside a
 * process that renders HTML, so we keep the blast radius small.
 */
const ServerEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  SESSION_JWT_PRIVATE_KEY: z.string().min(1),
  SESSION_JWT_PUBLIC_KEY: z.string().min(1),
  PADDLE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('noreply@sub.hexart.io'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Salt for hashing IP addresses; raw addresses are never stored or logged. */
  IP_HASH_SALT: z.string().min(16).default('dev-only-salt-change-me'),
})

const PublicEnv = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_RELAY_WS_URL: z.string().default('ws://localhost:8787'),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
})

let cached: z.infer<typeof ServerEnv> | null = null

export function serverEnv(): z.infer<typeof ServerEnv> {
  if (cached) return cached
  const parsed = ServerEnv.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    )
  }
  cached = parsed.data
  return cached
}

export const publicEnv = PublicEnv.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_RELAY_WS_URL: process.env.NEXT_PUBLIC_RELAY_WS_URL,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
})
