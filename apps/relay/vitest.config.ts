import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Every provider is injected as a double. A test that opens a socket is a bug.
    testTimeout: 10_000,
  },
})
