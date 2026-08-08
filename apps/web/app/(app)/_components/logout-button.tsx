'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await fetch('/api/auth/logout', { method: 'POST' })
        router.replace('/login')
        router.refresh()
      }}
      className="text-sm text-muted hover:text-paper disabled:opacity-50"
    >
      Wyloguj
    </button>
  )
}
