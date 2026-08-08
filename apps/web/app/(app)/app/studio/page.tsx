import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { glossaries } from '@sub/db'
import { planOf } from '@sub/billing'
import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/server/db'
import { availableCredits } from '@/lib/server/credits'
import { StudioClient } from './studio-client'

export const metadata: Metadata = { title: 'Studio' }
export const dynamic = 'force-dynamic'

export default async function StudioPage() {
  const user = await currentUser()
  if (!user) return null

  const plan = planOf(user.planCode)
  const [credits, glossaryRows] = await Promise.all([
    availableCredits(user.id),
    plan.glossaryEnabled
      ? db()
          .select({ id: glossaries.id, name: glossaries.name })
          .from(glossaries)
          .where(eq(glossaries.userId, user.id))
          .orderBy(asc(glossaries.name))
      : Promise.resolve([]),
  ])

  return (
    <StudioClient
      userId={user.id}
      emailVerified={user.emailVerifiedAt !== null}
      plan={{
        code: plan.code,
        name: plan.name,
        maxTargetLanguages: plan.maxTargetLanguages,
        voiceEnabled: plan.voiceEnabled,
        glossaryEnabled: plan.glossaryEnabled,
      }}
      credits={credits}
      glossaries={glossaryRows}
      /* The catalogue of AI voices is owned by the relay lane; until it exposes
         one the studio sends no voiceId and the relay picks its default. */
      voices={[]}
    />
  )
}
