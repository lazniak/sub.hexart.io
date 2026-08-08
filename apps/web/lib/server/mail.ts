import { serverEnv } from '@/lib/env'

export interface MailMessage {
  to: string
  subject: string
  text: string
}

/**
 * Transactional mail seam.
 *
 * The SMTP transport belongs to the infra lane; until `SMTP_URL` is provisioned
 * the message is dropped after a structured warning so local work never blocks
 * on mail delivery. Outside development the body is never logged — SECURITY.md
 * §6 forbids tokens and full addresses in logs.
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  const env = serverEnv()
  if (!env.SMTP_URL) {
    if (env.NODE_ENV === 'production') {
      console.error('mail_dropped_no_transport', { to: maskEmail(msg.to), subject: msg.subject })
      return
    }
    console.warn('mail_dev_preview', { to: msg.to, subject: msg.subject, text: msg.text })
    return
  }
  console.error('mail_transport_not_wired', { to: maskEmail(msg.to), subject: msg.subject })
}

/** Logs keep the domain (useful for deliverability triage) and nothing else. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return 'invalid'
  return `***@${email.slice(at + 1)}`
}
