#!/usr/bin/env node
/**
 * Keeps the relay's drain budget and Docker's stop grace period in agreement.
 *
 * They live in different lanes with only a comment binding them. Lower the
 * compose value and SIGKILL lands mid-drain: the broadcast is cut AND the last
 * ledger flush is lost — usage the user consumed and we never billed, or worse,
 * a reservation never released. This turns that into a failing build.
 */
import { readFile } from 'node:fs/promises'

const CONFIG = 'apps/relay/src/config.ts'
const COMPOSE = 'infra/docker-compose.yml'

// Normalised: a Windows checkout has CRLF, and the block match is line-anchored.
const config = (await readFile(CONFIG, 'utf8')).replace(/\r\n/g, '\n')
const compose = (await readFile(COMPOSE, 'utf8')).replace(/\r\n/g, '\n')

const drainExpr = /DRAIN_TIMEOUT_MS\s*=\s*([0-9*\s_]+)/.exec(config)?.[1]
if (!drainExpr) {
  console.error(`FAIL: DRAIN_TIMEOUT_MS not found in ${CONFIG}`)
  process.exit(1)
}

// The literal is a product of plain numbers, e.g. `10 * 60 * 1_000`.
const drainMs = drainExpr
  .split('*')
  .map((part) => Number(part.replace(/_/g, '').trim()))
  .reduce((a, b) => a * b, 1)

if (!Number.isFinite(drainMs) || drainMs <= 0) {
  console.error(`FAIL: could not evaluate DRAIN_TIMEOUT_MS from "${drainExpr.trim()}"`)
  process.exit(1)
}

// Scanned line by line. A regex is a trap here: with the `m` flag `$` matches at
// every line end, so a lazy quantifier terminates on the very first one.
const graceRaw = relayServiceLines(compose)
  .map((line) => /^\s*stop_grace_period:\s*(\d+)s\s*$/.exec(line)?.[1])
  .find(Boolean)

/** Lines belonging to the `relay:` service, i.e. until the next 2-space-indented key. */
function relayServiceLines(yaml) {
  const lines = yaml.split('\n')
  const start = lines.indexOf('  relay:')
  if (start === -1) return []

  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}\S/.test(line)) break
    body.push(line)
  }
  return body
}

if (!graceRaw) {
  console.error(`FAIL: relay service in ${COMPOSE} has no stop_grace_period in seconds`)
  process.exit(1)
}

const graceMs = Number(graceRaw) * 1000
const drainS = drainMs / 1000

if (graceMs <= drainMs) {
  console.error(
    `FAIL: relay stop_grace_period ${graceRaw}s must exceed DRAIN_TIMEOUT_MS ${drainS}s.\n` +
      'Otherwise SIGKILL interrupts the drain and the final ledger flush is lost.',
  )
  process.exit(1)
}

console.warn(`ok   stop_grace_period ${graceRaw}s > drain ${drainS}s`)
