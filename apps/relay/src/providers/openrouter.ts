import { buildTranslationPrompt, wrapTranscript } from '@sub/caption-engine'
import { OPENROUTER_BASE_URL } from '../config.js'

/**
 * OpenRouter client.
 *
 * Two distinct credentials live here and must never be confused:
 *   - the *runtime* key, created per user, capped to their balance, used for
 *     translation calls;
 *   - the *management* key, which can mint and revoke runtime keys and therefore
 *     never leaves the relay process (SECURITY.md §4).
 */

export type FetchLike = typeof fetch

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

export interface TranslateParams {
  apiKey: string
  model: string
  srcLang: string
  dstLang: string
  glossary: readonly string[]
  context: readonly string[]
  text: string
  signal?: AbortSignal
  fetchImpl?: FetchLike
}

/**
 * One translation call.
 *
 * The transcript comes from an open microphone, so anyone within earshot can speak
 * an injection attempt into it. It is passed as delimited *data* — never
 * concatenated into the instruction — and the result is length-checked before it
 * can reach a screen (SECURITY.md T6).
 */
export async function translate(params: TranslateParams): Promise<string> {
  const system = buildTranslationPrompt({
    srcLang: params.srcLang,
    dstLang: params.dstLang,
    glossary: params.glossary,
    context: params.context,
  })

  const raw = await chatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    system,
    user: wrapTranscript(params.text),
    maxTokens: maxTokensFor(params.text),
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
  })

  return sanitiseTranslation(raw, params.text)
}

export interface ChatCompletionParams {
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens: number
  signal?: AbortSignal
  fetchImpl?: FetchLike
}

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  const doFetch = params.fetchImpl ?? fetch
  const response = await doFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
    }),
    ...(params.signal ? { signal: params.signal } : {}),
  })

  if (!response.ok) {
    throw new OpenRouterError(response.status, `chat completion failed (${response.status})`)
  }

  const body: unknown = await response.json()
  const content = readFirstChoice(body)
  if (content === null) throw new OpenRouterError(response.status, 'chat completion had no content')
  return content
}

/**
 * A translation of a subtitle line is never much longer than its source. Anything
 * that is has stopped translating and started following instructions.
 */
export function sanitiseTranslation(raw: string, source: string): string {
  const limit = Math.max(120, source.length * 3)
  return raw.trim().replace(/\s+/g, ' ').slice(0, limit)
}

function maxTokensFor(text: string): number {
  return Math.min(512, Math.max(64, Math.ceil(text.length / 2)))
}

function readFirstChoice(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: { content?: unknown } }).message
  return typeof message?.content === 'string' ? message.content : null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Management API — per-user runtime keys
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RuntimeKey {
  /** The secret itself. Returned exactly once, at creation; encrypted before storage. */
  key: string
  /** Stable handle used for PATCH and DELETE. */
  hash: string
  limitUsd: number | null
}

export interface CreateRuntimeKeyParams {
  /** `u_{userId}` — greppable in the OpenRouter dashboard during an incident. */
  name: string
  limitUsd: number
}

/**
 * Creates, re-caps and revokes the per-user runtime keys.
 *
 * The cap is the second line of defence behind our own ledger: if metering ever
 * drifts, the provider stops the spend at the user's balance instead of ours.
 */
export class OpenRouterManagementClient {
  private readonly doFetch: FetchLike

  constructor(
    private readonly managementKey: string,
    fetchImpl?: FetchLike,
  ) {
    this.doFetch = fetchImpl ?? fetch
  }

  async createRuntimeKey(params: CreateRuntimeKeyParams): Promise<RuntimeKey> {
    const body = await this.request('POST', '/keys', {
      name: params.name,
      limit: params.limitUsd,
      // Balance-scoped, not calendar-scoped: a reset would hand out free credit.
      limit_reset: null,
    })
    return parseRuntimeKey(body)
  }

  async updateRuntimeKey(
    keyHash: string,
    patch: { limitUsd?: number; disabled?: boolean },
  ): Promise<void> {
    await this.request('PATCH', `/keys/${encodeURIComponent(keyHash)}`, {
      ...(patch.limitUsd === undefined ? {} : { limit: patch.limitUsd }),
      ...(patch.disabled === undefined ? {} : { disabled: patch.disabled }),
    })
  }

  async deleteRuntimeKey(keyHash: string): Promise<void> {
    await this.request('DELETE', `/keys/${encodeURIComponent(keyHash)}`)
  }

  private async request(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.doFetch(`${OPENROUTER_BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.managementKey}`,
        'content-type': 'application/json',
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
    if (!response.ok) {
      throw new OpenRouterError(response.status, `${method} ${path} failed (${response.status})`)
    }
    if (method === 'DELETE') return null
    return response.json()
  }
}

function parseRuntimeKey(body: unknown): RuntimeKey {
  if (typeof body !== 'object' || body === null) {
    throw new OpenRouterError(200, 'management API returned an unexpected body')
  }
  const record = body as { key?: unknown; data?: { hash?: unknown; limit?: unknown } }
  if (typeof record.key !== 'string' || typeof record.data?.hash !== 'string') {
    throw new OpenRouterError(200, 'management API returned an unexpected body')
  }
  return {
    key: record.key,
    hash: record.data.hash,
    limitUsd: typeof record.data.limit === 'number' ? record.data.limit : null,
  }
}
