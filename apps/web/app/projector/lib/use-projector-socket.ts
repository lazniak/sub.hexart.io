'use client'

import { useEffect, useRef, useState } from 'react'
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_WATCHDOG_MS,
  PROTOCOL_VERSION,
  ProjectorAttach,
  ProjectorPing,
  RelayMessage,
} from '@sub/contracts'

/**
 * Projector WebSocket client.
 *
 * Three properties this hook must never break:
 *  1. It never emits a "clear" of any kind. A dropped socket leaves the last
 *     frame on air — OBS is mid-broadcast and an empty caption band is worse
 *     than a stale one.
 *  2. It resumes with `lastSeq`, so an OBS Browser Source refresh backfills
 *     instead of restarting.
 *  3. It reconnects with jittered backoff: a venue-wide network blip otherwise
 *     brings every projector back in lockstep and stampedes the relay.
 */

export type ProjectorRole = 'captions' | 'voice'

export interface UseProjectorSocketOptions {
  token: string
  role: ProjectorRole
  onMessage: (msg: RelayMessage) => void
}

export interface ProjectorSocketState {
  /**
   * Diagnostic only — for the studio preview, never for the surface itself.
   * Nothing on `/projector/*` may render connection state: OBS composites this
   * viewport onto the broadcast, so an indicator appears on air precisely
   * during the outage it reports (PRODUCT.md §4).
   */
  connected: boolean
}

const RELAY_WS_URL = process.env.NEXT_PUBLIC_RELAY_WS_URL ?? 'ws://localhost:8787'

const BACKOFF_BASE_MS = 500
const BACKOFF_MAX_MS = 8_000
const BACKOFF_FACTOR = 1.8

/**
 * How long a socket must survive before its connection counts as healthy.
 *
 * A relay that accepts the upgrade and then closes — expired or revoked token,
 * session already ended, actor at capacity — looks exactly like a successful
 * connect. Resetting the backoff on `open` would turn that into a permanent
 * half-second reconnect loop from every projector attached to the session.
 */
const STABLE_CONNECTION_MS = 10_000

function backoffDelay(attempt: number): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt)
  return Math.round(ceiling * (0.5 + Math.random() * 0.5))
}

function projectorUrl(): string {
  return `${RELAY_WS_URL.replace(/\/+$/, '')}/projector`
}

export function useProjectorSocket(options: UseProjectorSocketOptions): ProjectorSocketState {
  const { token, role } = options
  const [connected, setConnected] = useState(false)

  // The consumer's handler changes identity on every render; keeping it in a ref
  // means a re-render never tears down a live socket.
  const onMessageRef = useRef(options.onMessage)
  onMessageRef.current = options.onMessage

  const lastSeqRef = useRef<number | null>(null)

  useEffect(() => {
    // Validate the identity once. A malformed token in the OBS URL must not turn
    // into a reconnect loop against the relay.
    const identity = ProjectorAttach.safeParse({
      t: 'attach',
      protocolVersion: PROTOCOL_VERSION,
      token,
      role,
    })
    if (!identity.success) return undefined

    let disposed = false
    let socket: WebSocket | null = null
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let lastRxAt = Date.now()
    let openedAt = 0

    const send = (ws: WebSocket, payload: unknown): void => {
      if (ws.readyState !== WebSocket.OPEN) return
      try {
        ws.send(JSON.stringify(payload))
      } catch {
        // A send failure means the socket is already going down; onclose handles it.
      }
    }

    const stopHeartbeat = (): void => {
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
    }

    const scheduleReconnect = (): void => {
      if (disposed || reconnectTimer !== null) return
      const delay = backoffDelay(attempt)
      attempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        open()
      }, delay)
    }

    const open = (): void => {
      if (disposed) return

      let ws: WebSocket
      try {
        ws = new WebSocket(projectorUrl())
      } catch {
        scheduleReconnect()
        return
      }
      socket = ws
      lastRxAt = Date.now()

      ws.onopen = () => {
        if (disposed) return
        openedAt = Date.now()
        lastRxAt = openedAt
        setConnected(true)

        const lastSeq = lastSeqRef.current
        send(ws, lastSeq !== null ? { ...identity.data, lastSeq } : identity.data)

        heartbeatTimer = setInterval(() => {
          // Silence past the watchdog means the socket is half-open: CEF keeps
          // such sockets alive indefinitely, so we force the reconnect ourselves.
          if (Date.now() - lastRxAt > HEARTBEAT_WATCHDOG_MS) {
            ws.close()
            return
          }
          send(ws, ProjectorPing.parse({ t: 'ping' }))
        }, HEARTBEAT_INTERVAL_MS)
      }

      ws.onmessage = (event: MessageEvent<unknown>) => {
        lastRxAt = Date.now()
        if (typeof event.data !== 'string') return

        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          return
        }

        const parsed = RelayMessage.safeParse(raw)
        if (!parsed.success) return

        const msg = parsed.data
        if ('seq' in msg) lastSeqRef.current = msg.seq
        onMessageRef.current(msg)
      }

      // No onerror handler: every failure also fires onclose, and nothing about a
      // failure is ever surfaced to the viewer.
      ws.onclose = () => {
        stopHeartbeat()
        if (disposed) return
        // Only a connection that actually carried a session clears the backoff.
        if (openedAt !== 0 && Date.now() - openedAt >= STABLE_CONNECTION_MS) attempt = 0
        openedAt = 0
        setConnected(false)
        scheduleReconnect()
      }
    }

    open()

    return () => {
      disposed = true
      stopHeartbeat()
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onclose = null
        socket.close()
      }
    }
  }, [token, role])

  return { connected }
}
