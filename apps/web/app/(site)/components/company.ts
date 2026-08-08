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
    purpose: 'Hosting serwera relay przetwarzającego strumień audio.',
    location: 'Niemcy (Falkenstein)',
    transferBasis: 'Przetwarzanie wyłącznie w EOG — transfer nie występuje',
    dataScope: 'Ruch sesji w pamięci procesu. Bez trwałego zapisu audio i transkrypcji.',
  },
  {
    name: 'Neon (Unia Europejska)',
    purpose: 'Baza danych PostgreSQL: konta, salda credits, historia sesji.',
    location: 'Unia Europejska (Frankfurt)',
    transferBasis: 'Przetwarzanie wyłącznie w EOG — transfer nie występuje',
    dataScope: 'Dane konta, ledger credits, metadane sesji (czas, języki, koszt). Bez treści.',
  },
  {
    name: 'Upstash (Unia Europejska)',
    purpose: 'Pamięć podręczna Redis: stan sesji, limity zapytań, tokeny projektora.',
    location: 'Unia Europejska',
    transferBasis: 'Przetwarzanie wyłącznie w EOG — transfer nie występuje',
    dataScope: 'Krótkotrwały stan sesji (TTL 15 minut), skróty adresów IP na potrzeby limitów.',
  },
  {
    name: 'Vercel (Unia Europejska / USA)',
    purpose: 'Hosting warstwy webowej: strona, panel, studio.',
    location: 'Region UE (Frankfurt); podmiot z siedzibą w USA',
    transferBasis: 'Standardowe klauzule umowne (SCC) Komisji Europejskiej',
    dataScope: 'Metadane żądań HTTP, logi techniczne. Bez audio i bez transkrypcji.',
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
