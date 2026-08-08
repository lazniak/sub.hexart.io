import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = '__Host-sub_session'
const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Edge gate. It only checks that a session cookie is present — the cookie is
 * opaque and the real lookup happens server-side in the layout and in every
 * route handler. Doing it here keeps the database off the edge and still stops
 * anonymous traffic before it reaches a panel render.
 */
export function middleware(req: NextRequest): NextResponse {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID()
  const headers = new Headers(req.headers)
  headers.set(REQUEST_ID_HEADER, requestId)

  const isPanel = req.nextUrl.pathname.startsWith('/app')
  const hasSession = req.cookies.has(SESSION_COOKIE)

  if (isPanel && !hasSession) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    const redirect = NextResponse.redirect(login)
    redirect.headers.set(REQUEST_ID_HEADER, requestId)
    return redirect
  }

  const res = NextResponse.next({ request: { headers } })
  res.headers.set(REQUEST_ID_HEADER, requestId)
  return res
}

export const config = {
  // The projector is deliberately excluded: it runs inside OBS, authenticates
  // with its own token and must never be redirected anywhere.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|projector).*)'],
}
