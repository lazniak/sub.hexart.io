import { z } from 'zod'

/**
 * Relay environment.
 *
 * Everything the relay needs arrives through `process.env`; nothing is read from
 * disk and no default ever carries a credential. Validation failures report the
 * variable *names* only — the values are secrets and must not reach a log line.
 */

export const ElevenLabsRegion = z.enum(['global', 'us', 'eu', 'in', 'sg'])
export type ElevenLabsRegion = z.infer<typeof ElevenLabsRegion>

const LogLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])

const EnvSchema = z.object({
  RELAY_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),

  /** Ed25519 SPKI public key (PEM, or the PEM base64-encoded). Verify only — the relay never signs. */
  SESSION_JWT_PUBLIC_KEY: z.string().min(1),

  ELEVENLABS_API_KEY_STT: z.string().min(1),
  ELEVENLABS_API_KEY_TTS: z.string().min(1),
  ELEVENLABS_STT_MODEL: z.string().min(1).default('scribe_v2_realtime'),
  ELEVENLABS_TTS_MODEL: z.string().min(1).default('eleven_flash_v2_5'),
  ELEVENLABS_REGION: ElevenLabsRegion.default('eu'),

  OPENROUTER_MANAGEMENT_API_KEY: z.string().min(1),
  OPENROUTER_MODEL_FAST: z.string().min(1),
  OPENROUTER_MODEL_QUALITY: z.string().min(1),

  /** 32 raw bytes, base64. Wraps the per-user OpenRouter runtime keys at rest. */
  PROVIDER_KEY_ENC_KEY: z.string().min(1),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  LOG_LEVEL: LogLevel.default('info'),
})

export type RelayConfig = z.infer<typeof EnvSchema>

export class ConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(`invalid relay environment: ${variables.join(', ')}`)
    this.name = 'ConfigError'
  }
}

export function loadConfig(source: Record<string, string | undefined> = process.env): RelayConfig {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
    throw new ConfigError(names)
  }
  return parsed.data
}

/** Residency endpoints. Keeping EU traffic in the EU is a DPA commitment, not a preference. */
const ELEVENLABS_HOSTS: Record<ElevenLabsRegion, string> = {
  global: 'api.elevenlabs.io',
  us: 'api.us.elevenlabs.io',
  eu: 'api.eu.residency.elevenlabs.io',
  in: 'api.in.residency.elevenlabs.io',
  sg: 'api.sg.residency.elevenlabs.io',
}

export function elevenLabsHost(region: ElevenLabsRegion): string {
  return ELEVENLABS_HOSTS[region]
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** A studio socket that has not completed the handshake is a resource leak. */
export const HANDSHAKE_TIMEOUT_MS = 5_000
/** Hard ceiling per §5 SECURITY.md; 20 ms frames mean 50/s in normal operation. */
export const MAX_AUDIO_FRAMES_PER_SECOND = 60
/** Handshakes per IP per minute. Redis owns the account-scoped limit; this is the edge one. */
export const MAX_HANDSHAKES_PER_IP_PER_MINUTE = 30
/** SIGTERM budget: refuse new sessions, let running ones finish. */
export const DRAIN_TIMEOUT_MS = 10 * 60 * 1_000
