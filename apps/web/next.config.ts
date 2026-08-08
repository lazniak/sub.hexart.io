import type { NextConfig } from 'next'

// Content-Security-Policy is set in middleware.ts, not here: it needs a
// per-request nonce so Next can tag the inline scripts it emits for hydration,
// and a static header cannot carry one. Everything below is nonce-independent.

const config: NextConfig = {
  /**
   * Standalone output is what the Docker image ships, but producing it requires
   * creating symlinks, which Windows refuses without developer mode. Gating it
   * on an explicit flag keeps `pnpm verify` runnable on every developer machine
   * while the image build (infra/Dockerfile.web) still gets the real thing.
   */
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  // The workspace packages ship TypeScript source, not a build artifact.
  transpilePackages: ['@sub/contracts', '@sub/billing', '@sub/caption-engine', '@sub/db'],

  /**
   * Those packages use explicit `.js` extensions in relative imports because the
   * relay compiles to real Node ESM, where extensions are mandatory. Bundlers
   * need to be told that `./pricing.js` means `./pricing.ts` on disk.
   */
  webpack(cfg) {
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return cfg
  },
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },

  async headers() {
    return [
      {
        source: '/projector/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // No X-Frame-Options here on purpose: OBS embeds this as a Browser
          // Source, and the CSP from middleware already scopes framing.
          { key: 'Permissions-Policy', value: 'microphone=(), camera=(), geolocation=()' },
        ],
      },
      {
        source: '/((?!projector).*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'microphone=(self), camera=(), geolocation=(), payment=(self)',
          },
        ],
      },
    ]
  },
}

export default config
