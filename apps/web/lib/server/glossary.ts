import { GLOSSARY_MAX_TERMS, GLOSSARY_MAX_TERM_LENGTH } from '@sub/contracts'

/**
 * Terms are Scribe keyterms, not free text: trimmed, de-duplicated and hard
 * capped at 50 × 20 characters because that is what the upstream API accepts.
 * The zod schema enforces the same bounds — this pass is what makes a paste of
 * 300 lines fail with a sentence instead of a stack trace.
 */
export function normaliseTerms(raw: readonly string[]): { terms: string[]; error: string | null } {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const candidate of raw) {
    const term = candidate.trim().replace(/\s+/g, ' ')
    if (!term) continue
    if (term.length > GLOSSARY_MAX_TERM_LENGTH) {
      return { terms: [], error: `Termin „${term}" przekracza ${GLOSSARY_MAX_TERM_LENGTH} znaków.` }
    }
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(term)
  }
  if (terms.length > GLOSSARY_MAX_TERMS) {
    return { terms: [], error: `Maksymalnie ${GLOSSARY_MAX_TERMS} terminów w glosariuszu.` }
  }
  return { terms, error: null }
}

/** One user cannot need more than this; the cap keeps the studio picker usable. */
export const MAX_GLOSSARIES_PER_USER = 20
