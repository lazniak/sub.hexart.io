/**
 * Operator, legal-document registry and subprocessor list.
 *
 * Anything that is not yet a confirmed fact is expressed as a `Placeholder`
 * marker rendered visibly in the page — never as an invented value. The open
 * items are tracked in docs/LEGAL.md §7.
 */

export const COMPANY = {
  legalName: 'hexart Sp. z o.o.',
  brand: 'hexart',
  productName: 'sub.hexart.io',
  productUrl: 'https://sub.hexart.io',
} as const

/** Paddle sells to the end customer; hexart provides the service. See docs/LEGAL.md §3. */
export const MERCHANT_OF_RECORD = {
  name: 'Paddle.com Market Ltd',
  role: 'Merchant of Record — sprzedawca wobec klienta końcowego',
} as const

export interface LegalDoc {
  slug: string
  href: string
  title: string
  summary: string
  /** Bumped on every substantive change; history lives in git and in docs/legal/. */
  version: string
}

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'regulamin',
    href: '/legal/regulamin',
    title: 'Regulamin',
    summary: 'Zasady świadczenia usługi, credits, płatności, odstąpienie, reklamacje.',
    version: '1.0.0-draft',
  },
  {
    slug: 'prywatnosc',
    href: '/legal/prywatnosc',
    title: 'Polityka prywatności',
    summary: 'Jakie dane przetwarzamy, na jakiej podstawie i jak długo. Audio — nigdy.',
    version: '1.0.0-draft',
  },
  {
    slug: 'cookies',
    href: '/legal/cookies',
    title: 'Polityka cookies',
    summary: 'Pliki cookies i pamięć lokalna. Bez analityki i bez marketingu.',
    version: '1.0.0-draft',
  },
  {
    slug: 'podprocesorzy',
    href: '/legal/podprocesorzy',
    title: 'Podprocesorzy',
    summary: 'Lista podmiotów przetwarzających dane w naszym imieniu.',
    version: '1.0.0-draft',
  },
  {
    slug: 'dpa',
    href: '/legal/dpa',
    title: 'Umowa powierzenia (DPA)',
    summary: 'Warunki powierzenia przetwarzania dla klientów biznesowych.',
    version: '1.0.0-draft',
  },
]

export function legalDoc(slug: string): LegalDoc {
  const doc = LEGAL_DOCS.find((entry) => entry.slug === slug)
  if (!doc) throw new Error(`Unknown legal document: ${slug}`)
  return doc
}

export interface Subprocessor {
  name: string
  purpose: string
  location: string
  /** Legal ground for the transfer, or a statement that no transfer occurs. */
  transferBasis: string
  dataScope: string
}

/**
 * The art. 28(2) disclosure. It must describe the infrastructure that actually
 * runs, not the one the design documents once planned.
 *
 * `docs/LEGAL.md` §4 and `docs/ARCHITECTURE.md` §3.1/§9 still list Vercel (web),
 * Neon (Postgres) and Upstash (Redis) as separate providers. That layout was
 * withdrawn by the accepted `docs/rfc/0001-single-vps-topology.md`, which folds
 * all four into one VPS and says so in as many words: "jeden podprocesor
 * infrastrukturalny zamiast czterech […] krótsza lista w polityce prywatności".
 * `infra/docker-compose.yml` runs postgres:17-alpine and redis:7-alpine as local
 * containers, and `apps/web/lib/server/{db,redis}.ts` connect over the internal
 * Compose network — so none of those three vendors receives any personal data.
 *
 * Naming a processor that processes nothing is not a harmless surplus: the Vercel
 * row declared an SCC-based transfer to the United States that does not happen,
 * and splitting the stack across four names understated how much sits with the
 * one provider that does hold it. Those two documents are stale and belong to the
 * `infra` / legal review, not to this lane.
 */
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: 'ElevenLabs (USA)',
    purpose: 'Rozpoznawanie mowy w czasie rzeczywistym (STT) oraz synteza głosu lektora (TTS).',
    location: 'Stany Zjednoczone',
    transferBasis: 'Standardowe klauzule umowne (SCC) Komisji Europejskiej',
    dataScope:
      'Strumień audio przetwarzany w locie oraz powstały z niego tekst. Bez zapisu po naszej stronie.',
  },
  {
    name: 'OpenRouter (USA)',
    purpose: 'Tłumaczenie maszynowe tekstu napisów.',
    location: 'Stany Zjednoczone',
    transferBasis: 'Standardowe klauzule umowne (SCC) Komisji Europejskiej',
    dataScope: 'Fragmenty tekstu transkrypcji przekazywane do tłumaczenia. Bez audio.',
  },
  {
    name: 'Paddle.com Market Ltd (Wielka Brytania / Irlandia)',
    purpose:
      'Obsługa płatności i sprzedaż jako Merchant of Record, wystawianie dokumentów sprzedaży.',
    location: 'Wielka Brytania, Irlandia',
    transferBasis:
      'Decyzja Komisji Europejskiej o odpowiednim stopniu ochrony dla Wielkiej Brytanii; Irlandia w EOG',
    dataScope:
      'Dane rozliczeniowe: adres e-mail, kraj, dane do faktury, NIP/VAT ID, historia zakupów.',
  },
  {
    name: 'Hetzner (Niemcy)',
    purpose:
      'Hosting całej aplikacji na jednym serwerze: strona i panel, serwer relay przetwarzający strumień audio, baza danych PostgreSQL oraz pamięć podręczna Redis.',
    location: 'Niemcy',
    transferBasis: 'Przetwarzanie wyłącznie w EOG — transfer nie występuje',
    dataScope:
      'Dane konta, rejestr credits, metadane sesji (czas, języki, koszt), krótkotrwały stan sesji i skróty adresów IP na potrzeby limitów, logi techniczne. Ruch audio wyłącznie w pamięci procesu — bez trwałego zapisu dźwięku.',
  },
]

/** Retention windows quoted in the privacy policy and the DPA. */
export const RETENTION = {
  audio: 'Nie zapisujemy. Audio przepływa przez relay i jest odrzucane po przetworzeniu ramki.',
  transcriptHours: 24,
  sessionMetadataMonths: 24,
  accountAfterDeletionDays: 30,
  ledgerYears: 5,
  technicalLogsDays: 30,
} as const
