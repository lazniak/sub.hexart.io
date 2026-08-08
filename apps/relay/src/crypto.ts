import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM for provider keys at rest.
 *
 * The version travels inside the payload rather than beside it in the schema, so
 * the encryption key can be rotated by writing new rows next to old ones — no
 * data migration, no window where half the table is unreadable.
 */

export const CURRENT_KEY_VERSION = 1

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

export class CryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoError'
  }
}

export interface DecryptedSecret {
  plaintext: string
  version: number
}

export function parseEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64')
  if (key.byteLength !== KEY_BYTES) {
    throw new CryptoError(`encryption key must decode to ${KEY_BYTES} bytes`)
  }
  return key
}

/** Wire format: `v<version>.<iv>.<tag>.<ciphertext>`, each part base64url. */
export function encryptSecret(
  plaintext: string,
  key: Buffer,
  version: number = CURRENT_KEY_VERSION,
): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [`v${version}`, b64(iv), b64(tag), b64(ciphertext)].join('.')
}

export function decryptSecret(payload: string, key: Buffer): DecryptedSecret {
  const parts = payload.split('.')
  if (parts.length !== 4) throw new CryptoError('malformed ciphertext envelope')

  const [versionPart, ivPart, tagPart, dataPart] = parts as [string, string, string, string]
  const version = parseVersion(versionPart)

  const iv = unb64(ivPart)
  const tag = unb64(tagPart)
  if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) {
    throw new CryptoError('malformed ciphertext envelope')
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(unb64(dataPart)), decipher.final()])
    return { plaintext: plaintext.toString('utf8'), version }
  } catch {
    // Never echo the cause: it distinguishes a wrong key from a tampered payload.
    throw new CryptoError('decryption failed')
  }
}

export function encryptionVersionOf(payload: string): number {
  const head = payload.split('.', 1)[0]
  if (head === undefined) throw new CryptoError('malformed ciphertext envelope')
  return parseVersion(head)
}

function parseVersion(part: string): number {
  if (!/^v\d+$/.test(part)) throw new CryptoError('malformed ciphertext envelope')
  return Number(part.slice(1))
}

function b64(buf: Buffer): string {
  return buf.toString('base64url')
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}
