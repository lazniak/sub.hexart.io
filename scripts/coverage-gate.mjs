#!/usr/bin/env node
/**
 * Coverage gate for the pure packages.
 *
 * Vitest enforces thresholds per project, but a missing coverage report silently
 * passes — which would let the billing package ship untested. This turns that
 * into a hard failure.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const GATES = [
  { pkg: 'packages/caption-engine', min: 90 },
  { pkg: 'packages/billing', min: 95 },
]

let failed = false

for (const { pkg, min } of GATES) {
  const summaryPath = resolve(process.cwd(), pkg, 'coverage', 'coverage-summary.json')

  if (!existsSync(summaryPath)) {
    console.error(`FAIL ${pkg}: no coverage report at ${summaryPath} — run tests with --coverage`)
    failed = true
    continue
  }

  const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
  const total = summary.total
  const metrics = ['statements', 'branches', 'functions', 'lines']

  for (const metric of metrics) {
    const pct = total?.[metric]?.pct
    if (typeof pct !== 'number') {
      console.error(`FAIL ${pkg}: coverage report has no "${metric}" total`)
      failed = true
      continue
    }
    if (pct < min) {
      console.error(`FAIL ${pkg}: ${metric} ${pct.toFixed(1)}% < ${min}%`)
      failed = true
    }
  }

  if (!failed) console.warn(`ok   ${pkg}: all metrics >= ${min}%`)
}

process.exit(failed ? 1 : 0)
