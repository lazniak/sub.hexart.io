import { asc, eq } from 'drizzle-orm'
import { glossaries } from '@sub/db'
import { planOf } from '@sub/billing'
import { GlossaryUpsert } from '@sub/contracts'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { MAX_GLOSSARIES_PER_USER, normaliseTerms } from '@/lib/server/glossary'
import { readAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const rows = await db()
    .select({
      id: glossaries.id,
      name: glossaries.name,
      terms: glossaries.terms,
      version: glossaries.version,
      updatedAt: glossaries.updatedAt,
    })
    .from(glossaries)
    .where(eq(glossaries.userId, auth.user.id))
    .orderBy(asc(glossaries.name))

  return json({ glossaries: rows }, req)
}

export async function POST(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const plan = planOf(auth.user.planCode)
  if (!plan.glossaryEnabled) {
    return fail(
      req,
      403,
      'PLAN_FEATURE_LOCKED',
      `Glosariusz jest dostępny od planu Creator (obecny: ${plan.name}).`,
    )
  }

  const parsed = GlossaryUpsert.safeParse(await readJson(req))
  if (!parsed.success) {
    return fail(req, 400, 'INVALID_INPUT', 'Sprawdź nazwę i listę terminów.')
  }

  const { terms, error } = normaliseTerms(parsed.data.terms)
  if (error) return fail(req, 400, 'INVALID_INPUT', error)

  const existing = await db()
    .select({ id: glossaries.id })
    .from(glossaries)
    .where(eq(glossaries.userId, auth.user.id))
  if (existing.length >= MAX_GLOSSARIES_PER_USER) {
    return fail(req, 409, 'LIMIT_REACHED', `Maksymalnie ${MAX_GLOSSARIES_PER_USER} glosariuszy.`)
  }

  const inserted = await db()
    .insert(glossaries)
    .values({ userId: auth.user.id, name: parsed.data.name.trim(), terms })
    .returning({ id: glossaries.id, name: glossaries.name, terms: glossaries.terms })

  return json({ glossary: inserted[0] }, req, { status: 201 })
}
