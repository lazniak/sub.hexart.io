import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // The studio needs a microphone; grant it up front so the flow is testable.
    permissions: ['microphone'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The projector is loaded by OBS's embedded CEF — Chromium is the honest proxy.
    { name: 'projector', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start -- -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
