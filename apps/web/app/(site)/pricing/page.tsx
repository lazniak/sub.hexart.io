import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PLANS,
  RATE_CAPTIONS_PER_MIN,
  RATE_TRANSLATION_PER_LANG_PER_MIN,
  RATE_VOICE_PER_MIN,
  TOPUP_VALIDITY_DAYS,
  estimateSeconds,
  formatAirtime,
  type Plan,
} from '@sub/billing'
import { CreditCalculator } from '../components/credit-calculator'
import { MERCHANT_OF_RECORD } from '../components/company'
import { PlanCard } from '../components/plan-card'
import { PlanComparison } from '../components/plan-comparison'
import { TopupCards } from '../components/topup-cards'
import { formatCredits } from '../components/format'

export const metadata: Metadata = {
  title: 'Cennik',
  description:
    'Plany, doładowania i przeliczniki credits. 1 credit = 1 minuta napisów. Ceny netto, bez ukrytych opłat.',
}

const PAID_PLANS: Plan[] = [PLANS.starter, PLANS.creator, PLANS.pro]

const TRIAL_AIRTIME = formatAirtime(
  estimateSeconds(PLANS.trial.credits, { targetLanguages: 0, voiceEnabled: false }),
)

const SECTION = 'mx-auto max-w-6xl px-4 py-12'

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-12" aria-labelledby="pricing-title">
        <h1
          id="pricing-title"
          className="text-3xl font-semibold tracking-tight text-paper sm:text-4xl"
        >
          Cennik
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Rozliczamy się w credits.{' '}
          <strong className="text-paper">1 credit = 1 minuta napisów</strong> w języku źródłowym.
          Tłumaczenie i lektor podnoszą zużycie na minutę — przeliczniki są poniżej, razem z
          kalkulatorem. Bez opłaty aktywacyjnej, bez zobowiązania, anulowanie jednym kliknięciem.
        </p>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          Konto zaczyna od bezpłatnego planu {PLANS.trial.name}: {PLANS.trial.credits} credits,
          czyli {TRIAL_AIRTIME} napisów, bez podawania karty.
        </p>
      </section>

      <section className={SECTION} aria-labelledby="plans-title">
        <h2 id="plans-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Plany
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {PAID_PLANS.map((plan) => (
            <PlanCard key={plan.code} plan={plan} highlighted={plan.code === 'creator'} />
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="comparison-title">
        <h2 id="comparison-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Porównanie planów
        </h2>
        <PlanComparison />
      </section>

      <section className={SECTION} aria-labelledby="rates-title">
        <h2 id="rates-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Przeliczniki
        </h2>
        <div
          role="region"
          aria-label="Przeliczniki credits — tabela przewijana w poziomie"
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-line"
        >
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 text-left font-semibold text-paper">
                  Składnik sesji
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-paper">
                  Zużycie
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                  Napisy w języku źródłowym
                </th>
                <td className="px-4 py-3 text-paper">
                  {formatCredits(RATE_CAPTIONS_PER_MIN)} cr/min
                </td>
              </tr>
              <tr className="border-b border-line">
                <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                  Każdy język tłumaczenia
                </th>
                <td className="px-4 py-3 text-paper">
                  + {formatCredits(RATE_TRANSLATION_PER_LANG_PER_MIN)} cr/min
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                  Lektor AI
                </th>
                <td className="px-4 py-3 text-paper">
                  + {formatCredits(RATE_VOICE_PER_MIN)} cr/min
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-6">
          <CreditCalculator />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="topups-title">
        <h2 id="topups-title" className="mb-2 text-xl font-semibold text-paper sm:text-2xl">
          Doładowania bez abonamentu
        </h2>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          Jednorazowy zakup credits. Działa też na koncie bez subskrypcji.
        </p>
        <TopupCards />
      </section>

      <section className={SECTION} aria-labelledby="expiry-title">
        <h2 id="expiry-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Ważność credits
        </h2>
        <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted">
          <p>
            <strong className="text-paper">
              Credits z abonamentu wygasają z końcem okresu rozliczeniowego
            </strong>{' '}
            i nie przechodzą na kolejny okres. Nowy okres to nowy, pełny przydział.
          </p>
          <p>
            <strong className="text-paper">
              Credits z doładowań są ważne {TOPUP_VALIDITY_DAYS} dni od zakupu
            </strong>{' '}
            i przechodzą przez kolejne okresy rozliczeniowe. Pozostają na koncie także po anulowaniu
            subskrypcji.
          </p>
          <p>
            Zużywamy najpierw credits z abonamentu, dopiero potem z doładowań — po to, żeby te z
            dłuższą ważnością zostały na koncie jak najdłużej.
          </p>
          <p>
            Credits są jednostką rozliczeniową usługi, nie pieniądzem elektronicznym. Nie podlegają
            wymianie na środki pieniężne poza przypadkiem odstąpienia od umowy opisanym w{' '}
            <Link href="/legal/regulamin" className="text-accent underline underline-offset-2">
              regulaminie
            </Link>
            .
          </p>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="payments-title">
        <h2 id="payments-title" className="mb-6 text-xl font-semibold text-paper sm:text-2xl">
          Płatności i podatki
        </h2>
        <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Wszystkie ceny na tej stronie są kwotami <strong className="text-paper">netto</strong>.
            Podatek VAT nalicza sprzedawca zgodnie z krajem nabywcy i pokazuje go w koszyku przed
            zapłatą.
          </p>
          <p>
            Sprzedawcą wobec klienta końcowego jest{' '}
            <strong className="text-paper">{MERCHANT_OF_RECORD.name}</strong> —{' '}
            {MERCHANT_OF_RECORD.role}. Ten podmiot wystawia dokument sprzedaży i obsługuje płatność.
            Usługę świadczy hexart. Firmy z UE mogą podać numer VAT UE do rozliczenia w procedurze
            odwrotnego obciążenia.
          </p>
          <p>
            Subskrypcję anulujesz jednym kliknięciem w panelu. Anulowanie działa na koniec
            opłaconego okresu — bez ankiety wyjściowej i bez kontaktu z obsługą.
          </p>
        </div>
      </section>
    </>
  )
}
