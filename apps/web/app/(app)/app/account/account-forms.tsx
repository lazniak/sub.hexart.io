'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Notice, controlClass } from '../../_components/ui'

async function post(url: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return { ok: true, message: '' }
  const payload = (await res.json().catch(() => null)) as { message?: string } | null
  return { ok: false, message: payload?.message ?? 'Nie udało się wykonać operacji.' }
}

export function ChangePasswordForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError('')
    setDone(false)

    const result = await post('/api/auth/password/change', {
      currentPassword: String(data.get('currentPassword') ?? ''),
      newPassword: String(data.get('newPassword') ?? ''),
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.message)
      return
    }
    form.reset()
    setDone(true)
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-4" noValidate>
      {error ? <Notice level="error">{error}</Notice> : null}
      {done ? (
        <Notice level="info">Hasło zmienione. Pozostałe urządzenia zostały wylogowane.</Notice>
      ) : null}
      <Field label="Obecne hasło">
        <input
          className={controlClass}
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="Nowe hasło" hint="Minimum 12 znaków.">
        <input
          className={controlClass}
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
        />
      </Field>
      <div>
        <Button variant="primary" type="submit" disabled={busy}>
          Zmień hasło
        </Button>
      </div>
    </form>
  )
}

export function DangerZone() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')

    const result = await post('/api/account/delete', {
      password: String(data.get('password') ?? ''),
      confirm: String(data.get('confirm') ?? ''),
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.message)
      return
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        {/* Plain anchor: the export is a file download, not a client navigation. */}
        <a
          href="/api/account/export"
          className="rounded border border-line px-3 py-2 text-sm font-medium hover:border-muted"
        >
          Pobierz moje dane (JSON)
        </a>
        <Button variant="danger" onClick={() => setOpen((v) => !v)}>
          Usuń konto
        </Button>
      </div>

      {open ? (
        <form onSubmit={onDelete} className="grid max-w-md gap-4" noValidate>
          {error ? <Notice level="error">{error}</Notice> : null}
          <Notice level="warn">
            Usunięcie jest nieodwracalne. Niewykorzystane credits przepadają.
          </Notice>
          <Field label="Hasło">
            <input
              className={controlClass}
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Wpisz USUŃ, żeby potwierdzić">
            <input className={controlClass} name="confirm" required />
          </Field>
          <div>
            <Button variant="danger" type="submit" disabled={busy}>
              Usuń konto na zawsze
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
