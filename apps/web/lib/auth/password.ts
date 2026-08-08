import { createHash } from 'node:crypto'
import { hash, verify, type Options } from '@node-rs/argon2'

/**
 * `Algorithm` is an ambient const enum, which `verbatimModuleSyntax` refuses to
 * inline, so the variant is written out: 2 = Argon2id.
 */
const ARGON2ID = 2

/** SECURITY.md §2 — argon2id, 64 MiB, 3 passes, 4 lanes. */
const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
}

export const PASSWORD_MIN_LENGTH = 12

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password, ARGON2_OPTIONS)
  } catch {
    return false
  }
}

/** Returns a Polish, user-facing reason, or null when the password is acceptable. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`
  }
  if (password.length > 200) return 'Hasło jest za długie.'
  if (/^\s|\s$/.test(password)) return 'Hasło nie może zaczynać się ani kończyć spacją.'
  return null
}

/**
 * Have I Been Pwned, k-anonymity: only the first five characters of the SHA-1
 * digest leave this process, so the password itself is never transmitted.
 * Fails open — an outage at HIBP must not lock people out of registration.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const digest = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return false
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':')
      if (hashSuffix === suffix && Number(count ?? 0) > 0) return true
    }
    return false
  } catch {
    return false
  }
}
