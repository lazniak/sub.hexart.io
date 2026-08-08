import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { glossaries } from '@sub/db'
import { planOf } from '@sub/billing'
import { GlossaryUpsert } from '@sub/contracts'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { normaliseTerms } from '@/lib/server/glossary'
import { readAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Id = z.string().uuid()

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const { id } = await ctx.params
  if (!Id.safeParse(id).success) return fail(req, 400, 'INVALID_INPUT', 'Nieprawidłowy adres.')

  const parsed = GlossaryUpsert.safeParse(await readJson(req))
  if (!parsed.success) return fail(req, 400, 'INVALID_INPUT', 'Sprawdź nazwę i listę terminów.')

  const { terms, error } = normaliseTerms(parsed.data.terms)
  if (error) return fail(req, 400, 'INVALID_INPUT', error)

  // The version bump is what tells a running relay session to reload keyterms.
  const updated = await db()
    .update(glossaries)
    .set({
      name: parsed.data.name.trim(),
      terms,
      version: sql`${glossaries.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(glossaries.id, id), eq(glossaries.userId, auth.user.id)))
    .returning({ id: glossaries.id, name: glossaries.name, terms: glossaries.terms })

  if (!updated[0]) return fail(req, 404, 'NOT_FOUND', 'Glosariusz nie istnieje.')
  return json({ glossary: updated[0] }, req)
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const { id } = await ctx.params
  if (!Id.safeParse(id).success) return fail(req, 400, 'INVALID_INPUT', 'Nieprawidłowy adres.')

  const deleted = await db()
    .delete(glossaries)
    .where(and(eq(glossaries.id, id), eq(glossaries.userId, auth.user.id)))
    .returning({ id: glossaries.id })

  if (!deleted[0]) return fail(req, 404, 'NOT_FOUND', 'Glosariusz nie istnieje.')
  return json({ ok: true }, req)
}
