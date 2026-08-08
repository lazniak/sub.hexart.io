import type { NextConfig } from 'next'

const RELAY_WS = process.env.NEXT_PUBLIC_RELAY_WS_URL ?? 'ws://localhost:8787'

/**
 * Two content security policies.
 *
 * The projector runs inside somebody's OBS and is composited onto a live
 * broadcast, so it gets a policy that allows nothing but its own styles and the
 * relay socket — no scripts from anywhere else, no analytics, no fonts.
 */
const projectorCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src ${RELAY_WS} ${RELAY_WS.replace('ws', 'http')}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors *",
].join('; ')

const appCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${RELAY_WS} https://*.paddle.com`,
  "frame-src https://*.paddle.com",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

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
  experimental: {
    typedRoutes: true,
  },

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
          { key: 'Content-Security-Policy', value: projectorCsp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // OBS embeds this as a Browser Source; framing must stay open.
          { key: 'Permissions-Policy', value: 'microphone=(), camera=(), geolocation=()' },
        ],
      },
      {
        // Everything except the projector — its headers are set above and must
        // not be overridden by the frame-denying app policy.
        source: '/((?!projector).*)',
        headers: [
          { key: 'Content-Security-Policy', value: appCsp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=(self)' },
        ],
      },
    ]
  },
}

export default config
