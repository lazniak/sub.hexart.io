import type { Metadata } from 'next'
import { RegisterForm } from './register-form'

export const metadata: Metadata = { title: 'Rejestracja' }

export default function RegisterPage() {
  return <RegisterForm />
}
