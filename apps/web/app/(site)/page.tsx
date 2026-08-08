import Link from 'next/link'
import { PLANS, formatAirtime, type Plan } from '@sub/billing'
import { AudienceTiles } from './components/audience-tiles'
import { Cta } from './components/cta'
import { airtimeSeconds } from './components/format'
import { PlanCard } from './components/plan-card'
import { ProofStrip } from './components/proof-strip'
import { StepList } from './components/step-list'
import { TrustList } from './components/trust-list'

const TRIAL_AIRTIME = formatAirtime(
  airtimeSeconds(PLANS.trial.credits, { targetLanguages: 0, voiceEnabled: false }),
)

const PAID_PLANS: Plan[] = [PLANS.starter, PLANS.creator, PLANS.pro]

const SECTION = 'mx-auto max-w-6xl px-4 py-14'

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-12 sm:pt-20" aria-labelledby="hero-title">
        <h1
          id="hero-title"
          className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl"
        >
          Napisy na żywo do OBS. Po polsku, po angielsku, w 90 językach.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Wybierasz mikrofon i język. Dostajesz link. Wklejasz go w OBS jako Browser Source.
          Opcjonalnie: lektor AI czyta tłumaczenie na głos.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Cta href="/register">Wypróbuj za darmo — {TRIAL_AIRTIME}</Cta>
          <p className="text-sm text-muted">bez karty</p>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="steps-title">
        <h2 id="steps-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Trzy kroki
        </h2>
        <StepList />
      </section>

      <section className={SECTION} aria-labelledby="proof-title">
        <h2 id="proof-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Dowód, że działa
        </h2>
        <ProofStrip />
      </section>

      <section className={SECTION} aria-labelledby="audience-title">
        <h2 id="audience-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Dla kogo
        </h2>
        <AudienceTiles />
      </section>

      <section className={SECTION} aria-labelledby="pricing-title">
        <h2 id="pricing-title" className="mb-2 text-xl font-semibold text-paper sm:text-2xl">
          Cennik
        </h2>
        <p className="mb-6 text-sm text-muted">
          1 credit = 1 minuta napisów. Tłumaczenie i lektor kosztują więcej — dokładne przeliczniki
          i kalkulator są na stronie cennika.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {PAID_PLANS.map((plan) => (
            <PlanCard key={plan.code} plan={plan} highlighted={plan.code === 'creator'} />
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">
          Albo kup credits bez abonamentu.{' '}
          <Link href="/pricing" className="text-accent underline underline-offset-2">
            Pełne porównanie planów, doładowania i kalkulator
          </Link>
          .
        </p>
      </section>

      <section className={SECTION} aria-labelledby="trust-title">
        <h2 id="trust-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Zaufanie
        </h2>
        <div className="max-w-2xl">
          <TrustList />
        </div>
      </section>
    </>
  )
}
