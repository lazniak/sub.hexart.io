'use client'

import { Suspense, use, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { RelayMessage } from '@sub/contracts'
import { AudioQueue, decodeBase64 } from '../../lib/audio-queue'
import { useProjectorSocket } from '../../lib/use-projector-socket'

/**
 * Audio-only surface for a second OBS Browser Source.
 *
 * It renders nothing at all — the operator drops it on a scene purely for its
 * audio, and a visible element here would end up composited onto the broadcast.
 * TTS arrives as base64 MP3 chunks and is scheduled on the AudioContext clock so
 * consecutive sentences play without a seam (see lib/audio-queue.ts).
 */

interface VoicePageProps {
  params: Promise<{ token: string }>
}

export default function ProjectorVoicePage({ params }: VoicePageProps) {
  return (
    <Suspense fallback={null}>
      <VoiceSurface params={params} />
    </Suspense>
  )
}

function VoiceSurface({ params }: VoicePageProps) {
  const { token } = use(params)
  const query = useSearchParams()
  const lang = query.get('lang')

  const queueRef = useRef<AudioQueue | null>(null)

  useEffect(() => {
    const queue = new AudioQueue()
    queueRef.current = queue
    void queue.resume()

    // OBS starts playback without a gesture; a browser preview needs one.
    const unlock = (): void => {
      void queue.resume()
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('visibilitychange', unlock)

    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('visibilitychange', unlock)
      queueRef.current = null
      queue.close()
    }
  }, [])

  const onMessage = useCallback(
    (msg: RelayMessage) => {
      if (msg.t !== 'tts') return
      // A voice source reads exactly one language; anything else belongs to
      // another Browser Source on the same session.
      if (lang && msg.lang !== lang) return

      const queue = queueRef.current
      if (!queue) return

      // A chunk that is not valid base64 is dropped, never thrown: this runs in
      // the socket handler, and the `final` flush below must still happen.
      const bytes = decodeBase64(msg.chunk)
      if (bytes) queue.push(bytes)
      if (msg.final) queue.flush()
    },
    [lang],
  )

  useProjectorSocket({ token, role: 'voice', onMessage })

  return <div className="projector-root projector-root--voice" aria-hidden="true" />
}
