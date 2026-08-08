'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { PLANS } from '@sub/billing'
import { AuthCard, Field, FormMessage, SubmitButton, postJson } from '../_components/form'

export function RegisterForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')

    setBusy(true)
    setError('')

    const result = await postJson('/api/auth/register', {
      email,
      password: String(data.get('password') ?? ''),
      acceptTerms: data.get('acceptTerms') === 'on',
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.message)
      return
    }
    setSent(email)
  }

  if (sent) {
    return (
      <AuthCard
        title="Sprawdź skrzynkę"
        lead={`Wysłaliśmy link potwierdzający na ${sent}. Po kliknięciu dostaniesz ${PLANS.trial.credits} credits na test.`}
        footer={
          <Link href="/verify" className="text-accent">
            Mam już token weryfikacyjny
          </Link>
        }
      >
        <p className="text-sm text-muted">
          Link jest ważny 24 godziny. Jeśli nie dotarł, sprawdź folder spam.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Załóż konto"
      lead={`${PLANS.trial.credits} credits na start — to około ${PLANS.trial.credits} minut napisów. Bez karty.`}
      footer={
        <>
          Masz już konto?{' '}
          <Link href="/login" className="text-accent">
            Zaloguj się
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
          autoComplete="new-password"
          hint="Minimum 12 znaków. Sprawdzamy, czy nie występuje w publicznych wyciekach."
          required
        />
        <label className="mb-4 flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="acceptTerms" required className="mt-1" />
          <span>
            Akceptuję regulamin i politykę prywatności. Wiem, że usługa jest świadczona od razu,
            więc tracę prawo odstąpienia po jej rozpoczęciu.
          </span>
        </label>
        <SubmitButton busy={busy}>Załóż konto</SubmitButton>
      </form>
    </AuthCard>
  )
}
