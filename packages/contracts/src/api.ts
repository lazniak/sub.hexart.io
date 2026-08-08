import { z } from 'zod'
import { SessionConfig } from './session.js'

/* POST /api/session/start — prices the config, reserves credits, mints the relay JWT. */
export const StartSessionRequest = z.object({
  config: SessionConfig,
})

export const StartSessionResponse = z.object({
  sessionId: z.string().uuid(),
  /** EdDSA, aud `relay`, 60 s TTL, single use. Never persisted client-side. */
  jwt: z.string(),
  relayUrl: z.string().url(),
  projectorToken: z.string(),
  projectorUrl: z.string().url(),
  burnRatePerMin: z.number(),
  creditsAvailable: z.number(),
  estimatedSeconds: z.number().int().nonnegative(),
})

export const StartSessionError = z.object({
  error: z.enum([
    'INSUFFICIENT_CREDITS',
    'CONCURRENCY_LIMIT',
    'PLAN_FEATURE_LOCKED',
    'EMAIL_NOT_VERIFIED',
    'RATE_LIMITED',
    'INVALID_CONFIG',
  ]),
  message: z.string(),
  /** Populated for INSUFFICIENT_CREDITS so the studio can offer a one-click top-up. */
  creditsNeeded: z.number().optional(),
})

export const RotateProjectorTokenResponse = z.object({
  projectorToken: z.string(),
  projectorUrl: z.string().url(),
})

/* Glossary */
export const GlossaryUpsert = z.object({
  name: z.string().min(1).max(60),
  terms: z.array(z.string().min(1).max(20)).max(50),
})

/* Account */
export const BillingProfile = z.object({
  companyName: z.string().max(200).optional(),
  vatId: z.string().max(20).optional(),
  country: z.string().length(2),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
})

export type StartSessionRequest = z.infer<typeof StartSessionRequest>
export type StartSessionResponse = z.infer<typeof StartSessionResponse>
export type StartSessionError = z.infer<typeof StartSessionError>
export type RotateProjectorTokenResponse = z.infer<typeof RotateProjectorTokenResponse>
export type GlossaryUpsert = z.infer<typeof GlossaryUpsert>
export type BillingProfile = z.infer<typeof BillingProfile>

/* Relay session JWT claims. */
export const RelayJwtClaims = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  aud: z.literal('relay'),
  jti: z.string(),
  plan: z.string(),
  /** Credits reserved up front; the relay tops the reservation up as it burns. */
  reserved: z.number(),
  cfg: SessionConfig,
  exp: z.number().int(),
  iat: z.number().int(),
})
export type RelayJwtClaims = z.infer<typeof RelayJwtClaims>

export const RELAY_JWT_TTL_SECONDS = 60
export const RELAY_JWT_AUDIENCE = 'relay' as const
