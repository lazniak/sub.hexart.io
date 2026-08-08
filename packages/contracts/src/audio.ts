/**
 * Audio wire format.
 *
 * Fixed by ElevenLabs Scribe v2 Realtime, which accepts PCM_16000: 16 kHz,
 * mono, signed 16-bit little-endian. We keep the browser producing exactly
 * that so the relay never has to transcode on the hot path.
 */
export const SAMPLE_RATE = 16_000
export const CHANNELS = 1
export const BYTES_PER_SAMPLE = 2

/** 20 ms frames: small enough for low latency, large enough to avoid syscall churn. */
export const FRAME_MS = 20
export const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000 // 320
export const FRAME_BYTES = SAMPLES_PER_FRAME * BYTES_PER_SAMPLE // 640

/** Binary frame layout: [0] = kind, [1..4] = uint32LE sequence, [5..] = PCM payload. */
export const AUDIO_FRAME_HEADER_BYTES = 5
export const AUDIO_FRAME_KIND = 0x01

export interface AudioFrame {
  seq: number
  pcm: Uint8Array
}

export function encodeAudioFrame(seq: number, pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(AUDIO_FRAME_HEADER_BYTES + pcm.byteLength)
  out[0] = AUDIO_FRAME_KIND
  new DataView(out.buffer).setUint32(1, seq >>> 0, true)
  out.set(pcm, AUDIO_FRAME_HEADER_BYTES)
  return out
}

export function decodeAudioFrame(buf: Uint8Array): AudioFrame | null {
  if (buf.byteLength <= AUDIO_FRAME_HEADER_BYTES) return null
  if (buf[0] !== AUDIO_FRAME_KIND) return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return { seq: view.getUint32(1, true), pcm: buf.subarray(AUDIO_FRAME_HEADER_BYTES) }
}

/** Frames of pure silence still cost bandwidth; the relay pauses metering instead. */
export const SILENCE_PAUSE_MS = 20_000
