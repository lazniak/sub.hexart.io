import { Suspense } from 'react'
import type { Metadata } from 'next'
import { VerifyForm } from './verify-form'

export const metadata: Metadata = { title: 'Potwierdzenie adresu' }

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  )
}
