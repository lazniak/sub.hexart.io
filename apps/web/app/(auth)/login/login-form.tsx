'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthCard, Field, FormMessage, SubmitButton, postJson } from '../_components/form'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')

    const result = await postJson('/api/auth/login', {
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.message)
      return
    }

    // Only same-origin paths, so a crafted ?next= cannot bounce anyone off-site.
    const next = params.get('next')
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app')
    router.refresh()
  }

  return (
    <AuthCard
      title="Zaloguj się"
      footer={
        <>
          Nie masz konta?{' '}
          <Link href="/register" className="text-accent">
            Załóż je w 20 sekund
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <Field
          label="Hasło"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <SubmitButton busy={busy}>Zaloguj</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link href="/reset" className="hover:text-paper">
          Nie pamiętam hasła
        </Link>
      </p>
    </AuthCard>
  )
}
