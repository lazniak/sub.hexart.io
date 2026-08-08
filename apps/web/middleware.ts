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
    `style-src 'self' 'nonce-${n}' 'unsafe-inline'`,
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src ${RELAY_WS} ${RELAY_HTTP}`,
    "base-uri 'none'",
    "form-action 'none'",
    // OBS embeds this as a Browser Source, so framing must stay open.
    'frame-ancestors *',
  ].join('; ')
}

function appCsp(n: string): string {
  return [
    "default-src 'self'",
    // `blob:` is required for the studio's AudioWorklet: the processor ships as a
    // string loaded through a blob URL, and worklet modules fall under script-src.
    // Without it the microphone silently fails to start.
    `script-src 'self' 'nonce-${n}' blob: https://cdn.paddle.com https://sandbox-cdn.paddle.com`,
    "worker-src 'self' blob:",
    `style-src 'self' 'nonce-${n}' 'unsafe-inline'`,
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
  const isProjector = req.nextUrl.pathname.startsWith('/projector')
  const n = nonce()
  const csp = isProjector ? projectorCsp(n) : appCsp(n)

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
