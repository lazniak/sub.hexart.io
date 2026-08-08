import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/* ── Identity ─────────────────────────────────────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    /** TOTP secret, AES-256-GCM. Required for admin accounts. */
    totpSecretEnc: text('totp_secret_enc'),
    role: text('role').notNull().default('user'),
    planCode: text('plan_code').notNull().default('trial'),
    trialGrantedAt: timestamp('trial_granted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(sql`lower(${t.email})`),
  }),
)

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUid: text('provider_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerIdx: uniqueIndex('oauth_provider_uid_idx').on(t.provider, t.providerUid),
  }),
)

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Hashed with a server-side salt — raw addresses are never stored. */
    ipHash: text('ip_hash'),
    userAgentFamily: text('user_agent_family'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('auth_sessions_user_idx').on(t.userId) }),
)

/* ── Billing ──────────────────────────────────────────────────────────────── */

export const billingProfiles = pgTable('billing_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  companyName: text('company_name'),
  vatId: text('vat_id'),
  country: text('country').notNull(),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  postalCode: text('postal_code'),
  city: text('city'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    paddleSubscriptionId: text('paddle_subscription_id').notNull(),
    planCode: text('plan_code').notNull(),
    status: text('status').notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paddleIdx: uniqueIndex('subscriptions_paddle_idx').on(t.paddleSubscriptionId),
    userIdx: index('subscriptions_user_idx').on(t.userId),
  }),
)

export const creditBucket = pgEnum('credit_bucket', ['trial', 'subscription', 'topup'])

/**
 * APPEND-ONLY. Balance is SUM(delta) — no row is ever updated or deleted.
 * CI rejects migrations that introduce UPDATE or DELETE against this table.
 */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    delta: numeric('delta', { precision: 14, scale: 4 }).notNull(),
    reason: text('reason').notNull(),
    bucket: creditBucket('bucket').notNull(),
    sessionId: uuid('session_id'),
    /** Paddle event id or relay flush id — makes webhook replays harmless. */
    idempotencyKey: text('idempotency_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('credit_ledger_user_idx').on(t.userId, t.createdAt),
    idempotencyIdx: uniqueIndex('credit_ledger_idempotency_idx').on(t.idempotencyKey),
  }),
)

/** Materialised for reads only. Rebuilt from the ledger; a mismatch is a P1 incident. */
export const creditBalances = pgTable('credit_balances', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: numeric('balance', { precision: 14, scale: 4 }).notNull().default('0'),
  trialBalance: numeric('trial_balance', { precision: 14, scale: 4 }).notNull().default('0'),
  subscriptionBalance: numeric('subscription_balance', { precision: 14, scale: 4 })
    .notNull()
    .default('0'),
  topupBalance: numeric('topup_balance', { precision: 14, scale: 4 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ── Sessions ─────────────────────────────────────────────────────────────── */

export const captionSessions = pgTable(
  'caption_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    srcLang: text('src_lang').notNull(),
    dstLangs: text('dst_langs').array().notNull().default(sql`ARRAY[]::text[]`),
    voiceEnabled: boolean('voice_enabled').notNull().default(false),
    voiceId: text('voice_id'),
    /** Opaque, read-only, scoped to this session. Ends up on stream — grants nothing. */
    projectorTokenHash: text('projector_token_hash').notNull(),
    burnRatePerMin: numeric('burn_rate_per_min', { precision: 8, scale: 4 }).notNull(),
    creditsSpent: numeric('credits_spent', { precision: 14, scale: 4 }).notNull().default('0'),
    billableSeconds: integer('billable_seconds').notNull().default(0),
    endReason: text('end_reason'),
    metrics: jsonb('metrics'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('caption_sessions_user_idx').on(t.userId, t.startedAt),
    projectorIdx: uniqueIndex('caption_sessions_projector_idx').on(t.projectorTokenHash),
  }),
)

export const glossaries = pgTable(
  'glossaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Scribe caps keyterms at 50 entries of 20 characters; enforced in the API layer. */
    terms: text('terms').array().notNull().default(sql`ARRAY[]::text[]`),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('glossaries_user_idx').on(t.userId) }),
)

/* ── Provider keys ────────────────────────────────────────────────────────── */

/**
 * Per-user OpenRouter runtime keys, created through the Management API and capped
 * to the user's balance. Encrypted at rest; never leaves the relay process.
 * ElevenLabs has no per-user equivalent outside Enterprise — that isolation comes
 * from SessionActor plus the ledger instead.
 */
export const providerKeys = pgTable(
  'provider_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** Upstream identifier used for PATCH/DELETE against the provider. */
    externalRef: text('external_ref').notNull(),
    keyEnc: text('key_enc').notNull(),
    keyEncVersion: integer('key_enc_version').notNull().default(1),
    limitUsd: numeric('limit_usd', { precision: 10, scale: 4 }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userProviderIdx: uniqueIndex('provider_keys_user_provider_idx').on(t.userId, t.provider),
  }),
)

/* ── Audit ────────────────────────────────────────────────────────────────── */

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta'),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ actionIdx: index('audit_log_action_idx').on(t.action, t.createdAt) }),
)

/** Records the art. 38 pkt 13 waiver: which terms version, when, from where. */
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    documentVersion: text('document_version').notNull(),
    granted: boolean('granted').notNull(),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userKindIdx: index('consents_user_kind_idx').on(t.userId, t.kind) }),
)

/* ── Relations ────────────────────────────────────────────────────────────── */

export const usersRelations = relations(users, ({ many, one }) => ({
  oauthAccounts: many(oauthAccounts),
  ledger: many(creditLedger),
  sessions: many(captionSessions),
  glossaries: many(glossaries),
  balance: one(creditBalances, { fields: [users.id], references: [creditBalances.userId] }),
  billingProfile: one(billingProfiles, {
    fields: [users.id],
    references: [billingProfiles.userId],
  }),
}))
