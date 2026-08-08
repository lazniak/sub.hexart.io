import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = '__Host-sub_session'
const REQUEST_ID_HEADER = 'x-request-id'
const CSP_HEADER = 'content-security-policy'

const RELAY_WS = process.env.NEXT_PUBLIC_RELAY_WS_URL ?? 'ws://localhost:8787'
const RELAY_HTTP = RELAY_WS.replace(/^ws/, 'http')

/**
 * Content-Security-Policy is built here rather than in next.config because it
 * needs a per-request nonce. Next reads the nonce out of the CSP on the *request*
 * headers and stamps it onto the inline scripts it emits for hydration; without
 * that, a policy strict enough to be worth having would stop the page from
 * hydrating at all.
 */
function nonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * The projector is composited onto a live broadcast. It gets almost nothing:
 * its own nonce-tagged scripts, its own styles, and one socket back to the relay.
 * No third-party origin appears here, deliberately — not even analytics.
 */
function projectorCsp(n: string): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${n}'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src ${RELAY_WS} ${RELAY_HTTP}`,
    "base-uri 'none'",
    "form-action 'none'",
    // OBS embeds this as a Browser Source, so framing must stay open.
    'frame-ancestors *',
  ].join('; ')
}

/**
 * Routes that Next renders per request, and can therefore carry a nonce.
 *
 * A statically prerendered page is a single HTML file; its inline hydration
 * script is written at build time, so no per-request nonce can ever appear on
 * it. Sending a nonce policy to such a page does not harden it — it stops it
 * from hydrating, because a nonce in the policy makes the browser ignore
 * `'unsafe-inline'`. The split below is therefore load-bearing, and
 * `e2e/csp.spec.ts` fails if a page is served a policy it cannot satisfy.
 */
const DYNAMIC_PREFIXES = ['/app', '/projector', '/login', '/register', '/reset', '/verify', '/api']

function isDynamicRoute(pathname: string): boolean {
  return DYNAMIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function appCsp(n: string | null): string {
  // Public marketing and legal pages are static: they get `'unsafe-inline'`
  // because there is no alternative, and they carry no cookie, no session and no
  // user data. Everything that does — panel, studio, auth — is dynamic and gets
  // the nonce.
  const inlinePolicy = n ? `'nonce-${n}'` : "'unsafe-inline'"
  return [
    "default-src 'self'",
    // `blob:` is required for the studio's AudioWorklet: the processor ships as a
    // string loaded through a blob URL, and worklet modules fall under script-src.
    // Without it the microphone silently fails to start.
    `script-src 'self' ${inlinePolicy} blob: https://cdn.paddle.com https://sandbox-cdn.paddle.com`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${RELAY_WS} https://*.paddle.com`,
    "media-src 'self' blob: data:",
    'frame-src https://*.paddle.com',
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

/**
 * Edge gate. Beyond CSP it only checks that a session cookie is present — the
 * cookie is opaque and the real lookup happens server-side in the layout and in
 * every route handler. Doing it here keeps the database off the edge and still
 * stops anonymous traffic before it reaches a panel render.
 */
export function middleware(req: NextRequest): NextResponse {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID()
  const { pathname } = req.nextUrl
  const isProjector = pathname.startsWith('/projector')
  // The projector is in DYNAMIC_PREFIXES, so it always gets a nonce — its policy
  // has no `'unsafe-inline'` fallback and must not be reachable without one.
  const n = isDynamicRoute(pathname) ? nonce() : null
  const csp = isProjector && n ? projectorCsp(n) : appCsp(n)

  const headers = new Headers(req.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  headers.set(CSP_HEADER, csp)

  // The projector authenticates with its own token and must never be redirected
  // anywhere — a redirect inside OBS is a blank source on somebody's stream.
  if (!isProjector && req.nextUrl.pathname.startsWith('/app') && !req.cookies.has(SESSION_COOKIE)) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    const redirect = NextResponse.redirect(login)
    redirect.headers.set(REQUEST_ID_HEADER, requestId)
    redirect.headers.set(CSP_HEADER, csp)
    return redirect
  }

  const res = NextResponse.next({ request: { headers } })
  res.headers.set(REQUEST_ID_HEADER, requestId)
  res.headers.set(CSP_HEADER, csp)
  return res
}

export const config = {
  matcher: [
    // Static assets carry no inline script and need no nonce; skipping them keeps
    // the middleware off the hot path for every chunk the browser fetches.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
