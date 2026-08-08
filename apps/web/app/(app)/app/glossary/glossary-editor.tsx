'use client'

import { useState } from 'react'
import { GLOSSARY_MAX_TERMS, GLOSSARY_MAX_TERM_LENGTH } from '@sub/contracts'
import { Button, Card, EmptyState, Field, Notice, controlClass } from '../../_components/ui'

export interface GlossaryRecord {
  id: string
  name: string
  terms: string[]
}

interface Props {
  initial: GlossaryRecord[]
}

async function call(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; message: string; payload: unknown }> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = (await res.json().catch(() => null)) as { message?: string } | null
  return {
    ok: res.ok,
    message: payload?.message ?? 'Nie udało się zapisać zmian.',
    payload,
  }
}

export function GlossaryEditor({ initial }: Props) {
  const [items, setItems] = useState(initial)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const terms = draft
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean)
  const tooLong = terms.filter((t) => t.length > GLOSSARY_MAX_TERM_LENGTH)

  async function onCreate() {
    setBusy(true)
    setError('')
    const result = await call('/api/glossary', 'POST', { name, terms })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    const created = (result.payload as { glossary?: GlossaryRecord } | null)?.glossary
    if (created) setItems((prev) => [...prev, created])
    setName('')
    setDraft('')
  }

  async function onDelete(id: string) {
    setBusy(true)
    const result = await call(`/api/glossary/${id}`, 'DELETE')
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <div className="grid gap-6">
      <Card title="Nowy glosariusz">
        {error ? <Notice level="error">{error}</Notice> : null}
        <div className="mt-4 grid gap-4">
          <Field label="Nazwa">
            <input
              className={controlClass}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Podcast — sezon 3"
            />
          </Field>
          <Field
            label="Terminy"
            hint={`Po przecinku lub w osobnych liniach. Maksymalnie ${GLOSSARY_MAX_TERMS} pozycji po ${GLOSSARY_MAX_TERM_LENGTH} znaków — taki limit ma rozpoznawanie mowy.`}
          >
            <textarea
              className={`${controlClass} min-h-32`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={'hexart\nOBS Studio\nScribe'}
            />
          </Field>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              {terms.length} / {GLOSSARY_MAX_TERMS} terminów
              {tooLong.length > 0 ? ` · ${tooLong.length} za długich` : ''}
            </span>
            <Button
              variant="primary"
              disabled={busy || !name.trim() || terms.length === 0 || tooLong.length > 0}
              onClick={onCreate}
            >
              Zapisz glosariusz
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Twoje glosariusze">
        {items.length === 0 ? (
          <EmptyState>Nie masz jeszcze żadnego glosariusza.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 rounded border border-line p-3"
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="mt-1 text-sm text-muted">
                    {item.terms.length} terminów: {item.terms.slice(0, 8).join(', ')}
                    {item.terms.length > 8 ? '…' : ''}
                  </div>
                </div>
                <Button variant="danger" disabled={busy} onClick={() => onDelete(item.id)}>
                  Usuń
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
