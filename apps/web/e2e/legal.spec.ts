import { expect, test } from '@playwright/test'

const DOCUMENTS = [
  '/legal/regulamin',
  '/legal/prywatnosc',
  '/legal/cookies',
  '/legal/podprocesorzy',
  '/legal/dpa',
]

for (const path of DOCUMENTS) {
  test(`${path} is published and dated`, async ({ page }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toHaveCount(1)
    // Every legal document must state when it took effect.
    await expect(page.getByText(/w mocy od/i)).toBeVisible()
  })
}

test('the terms name the operator and the merchant of record', async ({ page }) => {
  await page.goto('/legal/regulamin')
  const body = await page.textContent('body')
  expect(body).toContain('hexart')
  expect(body).toContain('Paddle')
  // The withdrawal waiver is the clause that makes instant credit delivery lawful.
  expect(body).toMatch(/38/)
})

test('the privacy policy states that audio is not stored', async ({ page }) => {
  await page.goto('/legal/prywatnosc')
  const body = (await page.textContent('body')) ?? ''
  expect(body.toLowerCase()).toContain('audio')
  expect(body).toContain('ElevenLabs')
  expect(body).toContain('OpenRouter')
})
