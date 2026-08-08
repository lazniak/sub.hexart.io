import { expect, test } from '@playwright/test'

/**
 * These assertions guard the two boundaries that a refactor can silently break:
 * the projector must never gain a script surface, and the app must never lose
 * its frame protection.
 */

test('app pages carry the strict security headers', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBeLessThan(400)

  const headers = response.headers()
  expect(headers['content-security-policy']).toBeTruthy()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
})

test('the projector runs under a policy that allows almost nothing', async ({ request }) => {
  const response = await request.get('/projector/pt_nonexistent')
  const csp = response.headers()['content-security-policy'] ?? ''

  expect(csp).toContain("default-src 'none'")
  // OBS embeds this as a Browser Source, so framing must stay open here.
  expect(csp).toContain('frame-ancestors *')
  expect(response.headers()['x-frame-options']).toBeUndefined()
  // No third-party origin may appear in the projector policy.
  expect(csp).not.toContain('paddle.com')
})

test('the projector is not offered to search engines', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(await robots.text()).toContain('Disallow: /projector/')
})

test('security.txt is published', async ({ request }) => {
  const response = await request.get('/.well-known/security.txt')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('security@hexart.pl')
})
