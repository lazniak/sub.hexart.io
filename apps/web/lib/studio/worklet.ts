export const WORKLET_PROCESSOR_NAME = 'pcm16-downsampler'

/**
 * AudioWorklet processor source, shipped as a string and loaded through a blob
 * URL so it stays in this package instead of becoming an untyped public asset.
 *
 * It runs on the audio render thread and does the whole conversion the relay
 * needs: resample whatever the device gives us down to 16 kHz, clamp, convert to
 * signed 16-bit little-endian and hand over exactly one 20 ms frame at a time.
 * Doing it here rather than on the main thread is what keeps capture jitter out
 * of the latency budget in ARCHITECTURE.md §2.
 */
export const WORKLET_SOURCE = `
class Pcm16Downsampler extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    this.frameSamples = opts.frameSamples
    this.ratio = sampleRate / opts.targetRate
    this.cursor = 0
    this.tail = new Float32Array(0)
    this.frame = new Int16Array(this.frameSamples)
    this.filled = 0
    this.peak = 0
    this.sinceLevel = 0
    this.levelEvery = sampleRate / 20
  }

  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]
    if (!channel || channel.length === 0) return true

    // Linear interpolation is enough here: Scribe consumes 16 kHz and speech
    // energy above 8 kHz carries nothing it uses.
    const merged = new Float32Array(this.tail.length + channel.length)
    merged.set(this.tail, 0)
    merged.set(channel, this.tail.length)

    let pos = this.cursor
    while (pos + 1 < merged.length) {
      const index = Math.floor(pos)
      const frac = pos - index
      const sample = merged[index] * (1 - frac) + merged[index + 1] * frac
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample
      const magnitude = clamped < 0 ? -clamped : clamped
      if (magnitude > this.peak) this.peak = magnitude

      this.frame[this.filled] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      this.filled += 1
      if (this.filled === this.frameSamples) {
        const out = this.frame.slice()
        this.port.postMessage({ type: 'frame', pcm: out.buffer }, [out.buffer])
        this.filled = 0
      }
      pos += this.ratio
    }

    const consumed = Math.floor(pos)
    this.tail = merged.slice(consumed)
    this.cursor = pos - consumed

    this.sinceLevel += channel.length
    if (this.sinceLevel >= this.levelEvery) {
      this.port.postMessage({ type: 'level', peak: this.peak })
      this.peak = 0
      this.sinceLevel = 0
    }
    return true
  }
}

registerProcessor(PROCESSOR_NAME_PLACEHOLDER, Pcm16Downsampler)
`.replace('PROCESSOR_NAME_PLACEHOLDER', JSON.stringify(WORKLET_PROCESSOR_NAME))

export function workletModuleUrl(): string {
  return URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
}
