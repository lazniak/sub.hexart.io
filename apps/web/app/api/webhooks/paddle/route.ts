import { eq } from 'drizzle-orm'
import { users } from '@sub/db'
import type { PaddleEvent } from '@sub/billing'
import { db } from '@/lib/server/db'
import { fail, json } from '@/lib/server/http'
import {
  applyOutcome,
  loadCatalog,
  outcomeFor,
  refreshBalance,
  verifySignature,
} from '@/lib/server/paddle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Paddle webhook.
 *
 * Order matters: verify the raw body's signature, then parse. Anything that
 * fails verification is dropped with a 401 and no side effect — the ledger is
 * append-only, so a bad write cannot be undone, only compensated.
 */
export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) return fail(req, 503, 'NOT_CONFIGURED', 'Billing webhook is not configured.')

  const raw = await req.text()
  const signature = req.headers.get('paddle-signature')

  if (!verifySignature(raw, signature, secret, Math.floor(Date.now() / 1000))) {
    return fail(req, 401, 'BAD_SIGNATURE', 'Signature verification failed.')
  }

  let payload: PaddleWebhookBody
  try {
    payload = JSON.parse(raw) as PaddleWebhookBody
  } catch {
    return fail(req, 400, 'BAD_PAYLOAD', 'Body is not valid JSON.')
  }

  const eventId = payload.event_id
  const eventType = payload.event_type
  if (!eventId || !eventType) {
    return fail(req, 400, 'BAD_PAYLOAD', 'Missing event_id or event_type.')
  }

  const userId = await resolveUserId(payload)
  if (!userId) {
    // Acknowledge: retrying will not make the account appear, and Paddle would
    // keep redelivering forever. The audit trail carries the orphan.
    return json({ ok: true, ignored: 'unknown customer' }, req)
  }

  const event: PaddleEvent = {
    eventId,
    eventType,
    userId,
    items: (payload.data?.items ?? []).map((item) => ({
      priceId: item.price?.id ?? item.price_id ?? '',
      quantity: item.quantity ?? 1,
    })),
    subscriptionId: payload.data?.subscription_id ?? payload.data?.id ?? null,
    status: payload.data?.status ?? null,
    currentPeriodEnd: parseDate(payload.data?.current_billing_period?.ends_at),
    refundCredits: null,
  }

  const outcome = outcomeFor(event, loadCatalog())
  const result = await applyOutcome(userId, outcome, eventId)
  await refreshBalance(userId)

  return json({ ok: true, ...result }, req)
}

/**
 * Our user id travels in `custom_data.user_id`, set when the checkout is opened.
 * Falling back to the email keeps a manually created Paddle transaction working.
 */
async function resolveUserId(payload: PaddleWebhookBody): Promise<string | null> {
  const fromCustomData = payload.data?.custom_data?.user_id
  if (fromCustomData) return fromCustomData

  const email = payload.data?.customer?.email
  if (!email) return null

  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  return rows[0]?.id ?? null
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

interface PaddleWebhookBody {
  event_id?: string
  event_type?: string
  data?: {
    id?: string
    status?: string
    subscription_id?: string
    custom_data?: { user_id?: string }
    customer?: { email?: string }
    current_billing_period?: { ends_at?: string }
    items?: { price?: { id?: string }; price_id?: string; quantity?: number }[]
  }
}
