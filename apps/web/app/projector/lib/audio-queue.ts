'use client'

/**
 * Web Audio scheduling for the voice surface.
 *
 * The relay streams TTS as base64 MP3 chunks. Playing each chunk with an
 * `<audio>` element leaves an audible seam between sentences, so we decode into
 * AudioBuffers and schedule them on the AudioContext clock: buffer N+1 starts
 * exactly where buffer N ends, independent of when it arrived.
 */

export interface AudioQueueOptions {
  /** Scheduling head-start. Below this, CEF occasionally misses the first buffer. */
  leadMs?: number
}

const DEFAULT_LEAD_MS = 80

/**
 * Bytes held back waiting for the rest of an MP3 frame.
 *
 * `decode` cannot tell "truncated mid-frame" from "corrupt", so without a cap a
 * single bad chunk would keep every later chunk appended to it, re-decoding an
 * ever-growing buffer for the rest of the session. On air that is a memory leak
 * and a rising CPU cost in CEF; dropping the held bytes costs one utterance.
 */
const MAX_PENDING_BYTES = 512 * 1024

/**
 * `null` rather than a throw on malformed input: this runs inside the WebSocket
 * message handler, and an exception there would take the rest of the frame —
 * including the `final` flush — with it. The contract types `chunk` as a plain
 * string, so nothing upstream guarantees it is base64.
 */
export function decodeBase64(value: string): Uint8Array | null {
  let binary: string
  try {
    binary = atob(value)
  } catch {
    return null
  }
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

export class AudioQueue {
  private ctx: AudioContext | null = null
  private output: GainNode | null = null
  private nextStartAt = 0
  /** Bytes that ended mid-frame; they decode once their remainder arrives. */
  private pending: Uint8Array | null = null
  /** Decoding is async, so a chain keeps buffers in arrival order. */
  private chain: Promise<void> = Promise.resolve()
  private readonly sources = new Set<AudioBufferSourceNode>()
  private readonly leadMs: number

  constructor(options: AudioQueueOptions = {}) {
    this.leadMs = options.leadMs ?? DEFAULT_LEAD_MS
  }

  /** OBS allows autoplay; ordinary browsers need this after a user gesture. */
  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // Still gesture-locked. The next resume() attempt will get it.
      }
    }
  }

  push(bytes: Uint8Array): void {
    this.chain = this.chain.then(() => this.decodeAndSchedule(bytes)).catch(() => undefined)
  }

  /** Called on the final chunk of an utterance: decode whatever is still held back. */
  flush(): void {
    this.chain = this.chain
      .then(async () => {
        const rest = this.pending
        if (!rest) return
        this.pending = null
        const buffer = await this.decode(rest)
        if (buffer) this.schedule(buffer)
      })
      .catch(() => undefined)
  }

  /** Drops everything scheduled but not yet heard. */
  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // Already ended.
      }
    }
    this.sources.clear()
    this.pending = null
    this.nextStartAt = 0
  }

  close(): void {
    this.stop()
    const ctx = this.ctx
    this.ctx = null
    this.output = null
    if (ctx) void ctx.close().catch(() => undefined)
  }

  /** Audio still queued ahead of the playhead, in seconds. */
  get queuedSeconds(): number {
    if (!this.ctx) return 0
    return Math.max(0, this.nextStartAt - this.ctx.currentTime)
  }

  private async decodeAndSchedule(bytes: Uint8Array): Promise<void> {
    const merged = this.pending ? concat(this.pending, bytes) : bytes
    const buffer = await this.decode(merged)
    if (!buffer) {
      // Past the cap the held bytes are not a truncated frame, they are garbage.
      this.pending = merged.byteLength <= MAX_PENDING_BYTES ? merged : null
      return
    }
    this.pending = null
    this.schedule(buffer)
  }

  private async decode(bytes: Uint8Array): Promise<AudioBuffer | null> {
    if (bytes.byteLength === 0) return null
    const ctx = this.context()
    // decodeAudioData detaches its input, so it gets a copy it may keep.
    const copy = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(copy).set(bytes)
    try {
      return await ctx.decodeAudioData(copy)
    } catch {
      return null
    }
  }

  private schedule(buffer: AudioBuffer): void {
    const ctx = this.context()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain(ctx))

    // Whichever is later: the scheduling floor, or the end of what is already queued.
    const startAt = Math.max(ctx.currentTime + this.leadMs / 1000, this.nextStartAt)
    source.start(startAt)
    this.nextStartAt = startAt + buffer.duration

    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
    }
  }

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' })
    return this.ctx
  }

  private gain(ctx: AudioContext): GainNode {
    if (!this.output) {
      this.output = ctx.createGain()
      this.output.gain.value = 1
      this.output.connect(ctx.destination)
    }
    return this.output
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}
