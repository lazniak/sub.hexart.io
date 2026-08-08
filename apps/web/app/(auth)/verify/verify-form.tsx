'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthCard, Field, FormMessage, SubmitButton, postJson } from '../_components/form'

type Phase = 'idle' | 'working' | 'failed'

export function VerifyForm() {
  const router = useRouter()
  const params = useSearchParams()
  const tokenFromLink = params.get('token')
  const [phase, setPhase] = useState<Phase>(tokenFromLink ? 'working' : 'idle')
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const attempted = useRef(false)

  const verify = useCallback(
    async (token: string) => {
      setPhase('working')
      setError('')
      const result = await postJson('/api/auth/verify', { token })
      if (!result.ok) {
        setError(result.message)
        setPhase('failed')
        return
      }
      router.replace('/app/studio')
      router.refresh()
    },
    [router],
  )

  // The token arrives in the URL; consuming it must happen exactly once, even
  // through a Strict Mode double render.
  useEffect(() => {
    if (!tokenFromLink || attempted.current) return
    attempted.current = true
    void verify(tokenFromLink)
  }, [tokenFromLink, verify])

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await postJson('/api/auth/verify/resend', { email: String(data.get('email') ?? '') })
    setResent(true)
  }

  if (phase === 'working') {
    return (
      <AuthCard title="Potwierdzamy adres…">
        <p className="text-sm text-muted">To potrwa moment.</p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Potwierdź adres e-mail"
      lead="Bez potwierdzonego adresu nie przyznajemy credits na trial."
    >
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {resent ? (
        <FormMessage tone="ok">Jeśli konto istnieje, nowy link już leci na skrzynkę.</FormMessage>
      ) : null}
      <form onSubmit={onResend} noValidate>
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <SubmitButton busy={false}>Wyślij link jeszcze raz</SubmitButton>
      </form>
    </AuthCard>
  )
}
