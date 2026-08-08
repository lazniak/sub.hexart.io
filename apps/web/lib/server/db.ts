import { createDb, type Database } from '@sub/db'
import { serverEnv } from '@/lib/env'

// Next dev reloads modules on every edit; without this cache each reload would
// open another pg Pool and exhaust the connection limit within minutes.
const cache = globalThis as typeof globalThis & { __subDb?: Database }

export function db(): Database {
  if (!cache.__subDb) cache.__subDb = createDb(serverEnv().DATABASE_URL)
  return cache.__subDb
}
