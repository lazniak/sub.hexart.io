import { createHash } from 'node:crypto'
import pino from 'pino'

export type Logger = pino.Logger

/**
 * Redaction whitelist.
 *
 * AGENTS.md §7 forbids transcripts, audio, tokens and plaintext e-mails in logs.
 * Redaction is applied by field name at serialisation time so an accidental
 * `log.info({ card })` cannot leak what somebody said on air.
 */
const REDACT_KEYS = [
  'text',
  'transcript',
  'partial',
  'committed',
  'cards',
  'audio',
  'audio_base_64',
  'pcm',
  'chunk',
  'jwt',
  'token',
  'projectorToken',
  'apiKey',
  'key',
  'keyEnc',
  'authorization',
  'xi-api-key',
  'email',
  'password',
]

const REDACT_PATHS = REDACT_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`])

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'relay' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: { level: (label) => ({ level: label }) },
  })
}

/** `sha256[:8]@domain` — enough to correlate incidents, not enough to identify anyone. */
export function emailFingerprint(email: string): string {
  const at = email.lastIndexOf('@')
  const domain = at === -1 ? 'unknown' : email.slice(at + 1).toLowerCase()
  return `${shortHash(email.toLowerCase())}@${domain}`
}

/** Correlate a token across log lines without ever writing the token itself. */
export function tokenFingerprint(token: string): string {
  return shortHash(token)
}

export function ipFingerprint(ip: string, salt: string): string {
  return shortHash(`${salt}:${ip}`)
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}
