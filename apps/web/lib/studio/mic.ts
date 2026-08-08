import { FRAME_BYTES, SAMPLE_RATE, SAMPLES_PER_FRAME, encodeAudioFrame } from '@sub/contracts'
import { WORKLET_PROCESSOR_NAME, workletModuleUrl } from '@/lib/studio/worklet'

export interface MicDevice {
  deviceId: string
  label: string
}

export interface MicStreamOptions {
  deviceId?: string
  /** Encoded, ready for the relay socket. One call per 20 ms of speech. */
  onFrame: (frame: Uint8Array) => void
  /** Peak amplitude 0..1, roughly 20× per second. Drives the level meter only. */
  onLevel?: (peak: number) => void
}

export interface MicStream {
  deviceId: string | null
  stop: () => Promise<void>
}

/**
 * Labels only appear once permission has been granted, so the picker stays empty
 * until the user has said yes at least once. That is a browser rule, not ours.
 */
export async function listMicrophones(): Promise<MicDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Mikrofon ${i + 1}` }))
}

export async function startMicStream(options: MicStreamOptions): Promise<MicStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  // Asking for a 16 kHz context makes the resampler a no-op on hardware that can
  // do it; where it cannot, the worklet still converts and nothing changes here.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  const moduleUrl = workletModuleUrl()
  try {
    await context.audioWorklet.addModule(moduleUrl)
  } finally {
    URL.revokeObjectURL(moduleUrl)
  }

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, WORKLET_PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    processorOptions: { targetRate: SAMPLE_RATE, frameSamples: SAMPLES_PER_FRAME },
  })

  let seq = 0
  node.port.onmessage = (event: MessageEvent) => {
    const data = event.data as { type: string; pcm?: ArrayBuffer; peak?: number }
    if (data.type === 'frame' && data.pcm) {
      const pcm = new Uint8Array(data.pcm)
      if (pcm.byteLength !== FRAME_BYTES) return
      options.onFrame(encodeAudioFrame(seq, pcm))
      // uint32 on the wire; wrapping keeps the relay's sequence arithmetic sane.
      seq = (seq + 1) >>> 0
    } else if (data.type === 'level' && options.onLevel) {
      options.onLevel(data.peak ?? 0)
    }
  }

  source.connect(node)
  if (context.state === 'suspended') await context.resume()

  const track = stream.getAudioTracks()[0]
  return {
    deviceId: track?.getSettings().deviceId ?? null,
    stop: async () => {
      node.port.onmessage = null
      node.disconnect()
      source.disconnect()
      for (const t of stream.getTracks()) t.stop()
      await context.close()
    },
  }
}
