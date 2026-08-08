import WebSocket, { type RawData } from 'ws'

/**
 * The socket surface the provider clients depend on.
 *
 * They take a factory instead of importing `ws` directly, so the tests drive them
 * with an in-memory double. AGENTS.md §6: no paid API is ever reached from a test.
 */

export interface UpstreamSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
  readonly open: boolean
}

export interface UpstreamHandlers {
  onOpen(): void
  onMessage(data: string): void
  onClose(code: number, reason: string): void
  onError(error: Error): void
}

export type SocketFactory = (
  url: string,
  headers: Record<string, string>,
  handlers: UpstreamHandlers,
) => UpstreamSocket

export const createWsSocket: SocketFactory = (url, headers, handlers) => {
  const ws = new WebSocket(url, { headers })
  let open = false

  ws.on('open', () => {
    open = true
    handlers.onOpen()
  })
  ws.on('message', (data: RawData) => handlers.onMessage(rawToString(data)))
  ws.on('close', (code: number, reason: Buffer) => {
    open = false
    handlers.onClose(code, reason.toString('utf8'))
  })
  ws.on('error', (error: Error) => {
    open = false
    handlers.onError(error)
  })

  return {
    send(data) {
      // Dropping a frame beats queueing it: stale audio arriving late is worse than a gap.
      if (open) ws.send(data)
    },
    close(code, reason) {
      open = false
      ws.close(code, reason)
    },
    get open() {
      return open
    },
  }
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data as ArrayBuffer).toString('utf8')
}
