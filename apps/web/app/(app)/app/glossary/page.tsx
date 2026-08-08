import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { glossaries } from '@sub/db'
import { planOf } from '@sub/billing'
import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/server/db'
import { Card, Notice } from '../../_components/ui'
import { GlossaryEditor } from './glossary-editor'

export const metadata: Metadata = { title: 'Glosariusz' }
export const dynamic = 'force-dynamic'

export default async function GlossaryPage() {
  const user = await currentUser()
  if (!user) return null

  const plan = planOf(user.planCode)
  const rows = await db()
    .select({ id: glossaries.id, name: glossaries.name, terms: glossaries.terms })
    .from(glossaries)
    .where(eq(glossaries.userId, user.id))
    .orderBy(asc(glossaries.name))

  if (!plan.glossaryEnabled) {
    return (
      <Card title="Glosariusz">
        <Notice level="info">
          Glosariusz jest dostępny od planu Creator. Obecny plan: {plan.name}.
        </Notice>
        <p className="mt-4 text-sm text-muted">
          Glosariusz podpowiada rozpoznawaniu mowy nazwy własne, skróty i terminy branżowe — imiona
          gości, nazwy produktów, marki.
        </p>
      </Card>
    )
  }

  return <GlossaryEditor initial={rows} />
}
