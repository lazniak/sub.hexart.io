#!/usr/bin/env node
/**
 * Enforces the lane boundaries from AGENTS.md §3.
 *
 * A PR may touch one lane plus the documented shared zone. Crossing lanes is
 * allowed only with an `rfc` or `governance` label, which is exactly the escape
 * hatch AGENTS.md §4 describes.
 */
import { execFileSync } from 'node:child_process'

const LANES = {
  contracts: ['packages/contracts/'],
  engine: ['packages/caption-engine/'],
  relay: ['apps/relay/'],
  'web-app': [
    'apps/web/app/(app)/',
    'apps/web/app/(auth)/',
    'apps/web/app/api/',
    'apps/web/lib/auth/',
    'apps/web/lib/studio/',
    'apps/web/lib/server/',
    'apps/web/middleware.ts',
  ],
  'web-site': ['apps/web/app/(site)/', 'apps/web/app/(legal)/', 'apps/web/messages/'],
  projector: ['apps/web/app/projector/'],
  billing: [
    'packages/billing/',
    'apps/web/app/api/webhooks/paddle/',
    'apps/web/app/api/checkout/',
    'apps/web/lib/server/paddle.ts',
  ],
  data: ['packages/db/'],
  infra: ['infra/', '.github/', 'Dockerfile'],
}

/** Touchable by any lane, one change per PR, never as a drive-by refactor. */
const SHARED = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'eslint.config.js',
  '.prettierrc.json',
  '.env.example',
  '.gitattributes',
  '.gitignore',
  'vitest.workspace.ts',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/',
  '.agents/',
  'scripts/',
  'apps/web/package.json',
  'apps/web/tsconfig.json',
  'apps/web/next.config.ts',
  'apps/web/e2e/',
  'apps/web/public/',
]

const labels = (process.env.LABELS ?? '').split(',').map((s) => s.trim())
if (labels.includes('rfc') || labels.includes('governance')) {
  console.warn('lane-guard: skipped (rfc/governance label present)')
  process.exit(0)
}

const base = process.env.BASE
const head = process.env.HEAD
if (!base || !head) {
  console.error('lane-guard: BASE and HEAD are required')
  process.exit(1)
}

const changed = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
  encoding: 'utf8',
})
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

const touched = new Set()
const unclaimed = []

for (const file of changed) {
  if (SHARED.some((prefix) => file === prefix || file.startsWith(prefix))) continue

  const lane = Object.entries(LANES).find(([, prefixes]) =>
    prefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
  )

  if (lane) touched.add(lane[0])
  else unclaimed.push(file)
}

let failed = false

// web-app and billing overlap on the Paddle webhook path; billing wins there.
if (touched.has('billing') && touched.has('web-app')) touched.delete('web-app')

if (touched.size > 1) {
  console.error(`::error::PR touches ${touched.size} lanes: ${[...touched].join(', ')}`)
  console.error('Split it, or add an `rfc` label with a document in docs/rfc/. See AGENTS.md §3-§4.')
  failed = true
}

if (unclaimed.length > 0) {
  console.error(`::error::Files outside every lane and the shared zone:\n  ${unclaimed.join('\n  ')}`)
  console.error('Add them to a lane in .agents/lanes.md and to this script, in one PR.')
  failed = true
}

if (!failed) {
  console.warn(`lane-guard: ok (lane: ${[...touched].join(', ') || 'shared only'})`)
}

process.exit(failed ? 1 : 0)
