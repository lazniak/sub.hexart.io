import { expect, test } from '@playwright/test'

/**
 * A nonce-based CSP and a statically prerendered page are mutually exclusive: the
 * inline hydration script is written at build time and cannot carry a per-request
 * nonce, while a nonce in the policy makes the browser ignore `'unsafe-inline'`.
 * Get the split wrong and the page stops hydrating — silently, and only in
 * production, because `next dev` serves everything dynamically.
 *
 * These tests make that failure loud. If a new page is added under a dynamic
 * prefix, or an existing dynamic route becomes static, one of them fails.
 */

const PUBLIC_PAGES = ['/', '/pricing', '/legal/regulamin', '/legal/prywatnosc', '/legal/cookies']
const DYNAMIC_PAGES = ['/login', '/register', '/projector/pt_smoke']

function nonceOf(csp: string): string | null {
  return /'nonce-([^']+)'/.exec(csp)?.[1] ?? null
}

for (const path of [...PUBLIC_PAGES, ...DYNAMIC_PAGES]) {
  test(`${path} serves a policy its own HTML can satisfy`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBeLessThan(500)

    const csp = response.headers()['content-security-policy'] ?? ''
    expect(csp, 'every route must carry a CSP').not.toBe('')

    const html = await response.text()
    const inlineScripts = html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? []
    const nonce = nonceOf(csp)

    if (nonce) {
      // Under a nonce policy every inline script must carry that exact nonce,
      // because `'unsafe-inline'` is ignored the moment a nonce is present.
      for (const tag of inlineScripts) {
        expect(tag, `inline script without the nonce on ${path}`).toContain(`nonce="${nonce}"`)
      }
    } else if (inlineScripts.length > 0) {
      expect(csp, `${path} is static and has inline scripts, so it needs unsafe-inline`).toContain(
        "'unsafe-inline'",
      )
    }
  })
}

test('the projector policy is the strict one and admits no third party', async ({ request }) => {
  const csp = (await request.get('/projector/pt_smoke')).headers()['content-security-policy'] ?? ''

  expect(csp).toContain("default-src 'none'")
  expect(nonceOf(csp)).not.toBeNull()
  // A nonce without this would be theatre: the projector must never fall back.
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
  expect(csp).not.toContain('paddle.com')
  // OBS embeds it as a Browser Source.
  expect(csp).toContain('frame-ancestors *')
})

test('the studio may load its AudioWorklet from a blob URL', async ({ request }) => {
  const csp = (await request.get('/login')).headers()['content-security-policy'] ?? ''
  // Without blob: in script-src the microphone silently never starts.
  expect(csp).toMatch(/script-src[^;]*blob:/)
  expect(csp).toContain("worker-src 'self' blob:")
})
