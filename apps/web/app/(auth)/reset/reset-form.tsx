'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthCard, Field, FormMessage, SubmitButton, postJson } from '../_components/form'

export function ResetForm() {
  const router = useRouter()
  const token = useSearchParams().get('token')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [requested, setRequested] = useState(false)

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    await postJson('/api/auth/password/forgot', { email: String(data.get('email') ?? '') })
    setBusy(false)
    setRequested(true)
  }

  async function onReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    const result = await postJson('/api/auth/password/reset', {
      token,
      password: String(data.get('password') ?? ''),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    router.replace('/app')
    router.refresh()
  }

  if (token) {
    return (
      <AuthCard title="Ustaw nowe hasło" lead="Pozostałe zalogowane urządzenia zostaną wylogowane.">
        <form onSubmit={onReset} noValidate>
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <Field
            label="Nowe hasło"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="Minimum 12 znaków."
            required
          />
          <SubmitButton busy={busy}>Zapisz hasło</SubmitButton>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset hasła"
      lead="Wyślemy link ważny 15 minut. Działa tylko w tej przeglądarce."
      footer={
        <Link href="/login" className="text-accent">
          Wróć do logowania
        </Link>
      }
    >
      {requested ? (
        <FormMessage tone="ok">Jeśli konto istnieje, link do resetu jest już w drodze.</FormMessage>
      ) : null}
      <form onSubmit={onRequest} noValidate>
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <SubmitButton busy={busy}>Wyślij link</SubmitButton>
      </form>
    </AuthCard>
  )
}
