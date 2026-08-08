import { NextResponse } from 'next/server'

export const REQUEST_ID_HEADER = 'x-request-id'

export function requestId(req: Request): string {
  return req.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID()
}

interface JsonOptions {
  status?: number
  headers?: Record<string, string>
}

/**
 * Everything under /api touches account state or credits, so nothing here is
 * cacheable — an intermediary holding a balance response would be a bug we could
 * not see from the server side.
 */
export function json<T>(body: T, req: Request, opts: JsonOptions = {}): NextResponse {
  return NextResponse.json(body, {
    status: opts.status ?? 200,
    headers: {
      'cache-control': 'no-store',
      [REQUEST_ID_HEADER]: requestId(req),
      ...opts.headers,
    },
  })
}

export function fail(
  req: Request,
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return json({ error, message, ...extra }, req, { status })
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}
