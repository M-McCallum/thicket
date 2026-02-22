import { Rnnoise, type DenoiseState } from '@shiguredo/rnnoise-wasm'
import { Track, type Room } from 'livekit-client'
import type { TrackProcessor, AudioProcessorOptions } from 'livekit-client'
import { RNNOISE_PROCESSOR_NAME, rnnoiseProcessorCode } from '@/audio/rnnoise-worklet-processor'

/**
 * Creates an RNNoise TrackProcessor compatible with LiveKit's setProcessor() API.
 * Audio flows: mic track → AudioWorklet (buffering) → main-thread RNNoise WASM → output track
 */
function createRnnoiseTrackProcessor(rnnoise: Rnnoise): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  let denoiseState: DenoiseState | null = null
  let workletNode: AudioWorkletNode | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let destNode: MediaStreamAudioDestinationNode | null = null

  async function setupPipeline(opts: AudioProcessorOptions) {
    const { track, audioContext } = opts

    denoiseState = rnnoise.createDenoiseState()

    // Register worklet processor
    const blob = new Blob([rnnoiseProcessorCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      await audioContext.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }

    // Build audio graph: source → worklet → destination
    const micStream = new MediaStream([track])
    sourceNode = audioContext.createMediaStreamSource(micStream)
    destNode = audioContext.createMediaStreamDestination()
    workletNode = new AudioWorkletNode(audioContext, RNNOISE_PROCESSOR_NAME, {
      channelCount: 1,
      channelCountMode: 'explicit',
    })

    // Process frames on main thread with RNNoise WASM
    workletNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'frame' && denoiseState) {
        const frame = new Float32Array(e.data.frame)

        // RNNoise expects 16-bit PCM range
        for (let i = 0; i < frame.length; i++) {
          frame[i] *= 32768
        }

        denoiseState.processFrame(frame)

        // Scale back to float range
        for (let i = 0; i < frame.length; i++) {
          frame[i] /= 32768
        }

        workletNode?.port.postMessage(
          { type: 'processed', frame: frame.buffer },
          [frame.buffer]
        )
      }
    }

    sourceNode.connect(workletNode)
    workletNode.connect(destNode)

    // Set the processed output track
    processor.processedTrack = destNode.stream.getAudioTracks()[0]
  }

  function teardown() {
    sourceNode?.disconnect()
    workletNode?.disconnect()
    workletNode?.port.close()
    denoiseState?.destroy()
    sourceNode = null
    workletNode = null
    destNode = null
    denoiseState = null
    processor.processedTrack = undefined
  }

  const processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
    name: 'rnnoise-noise-cancellation',

    async init(opts: AudioProcessorOptions) {
      await setupPipeline(opts)
    },

    async restart(opts: AudioProcessorOptions) {
      teardown()
      await setupPipeline(opts)
    },

    async destroy() {
      teardown()
    },
  }

  return processor
}

/**
 * Singleton service managing AI-powered noise cancellation via RNNoise WASM.
 * Uses LiveKit's TrackProcessor API for clean integration.
 */
class NoiseProcessorService {
  private rnnoise: Rnnoise | null = null
  private processorActive = false

  get isSupported(): boolean {
    return typeof AudioWorkletNode !== 'undefined'
  }

  /** Pre-load the RNNoise WASM module to avoid mid-call latency. */
  async initialize(): Promise<void> {
    if (this.rnnoise) return
    this.rnnoise = await Rnnoise.load()
  }

  /** Apply RNNoise processing to the local mic track via LiveKit's processor API. */
  async applyToTrack(room: Room): Promise<void> {
    if (!this.rnnoise) await this.initialize()

    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
    const localTrack = micPub?.track
    if (!localTrack) {
      console.warn('[NoiseProcessor] No mic track to process')
      return
    }

    // If already active, stop the old processor first
    if (this.processorActive) {
      await localTrack.stopProcessor()
    }

    const processor = createRnnoiseTrackProcessor(this.rnnoise!)
    // Cast needed: LiveKit's generic TrackProcessor type is wider than our audio-specific one
    await localTrack.setProcessor(processor as any)
    this.processorActive = true
  }

  /** Remove RNNoise processing from the local mic track. */
  async removeFromTrack(room: Room): Promise<void> {
    if (!this.processorActive) return
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
    if (micPub?.track) {
      await micPub.track.stopProcessor()
    }
    this.processorActive = false
  }

  /** Full cleanup — call when leaving voice channel. */
  destroy(): void {
    this.processorActive = false
    // The processor is destroyed by LiveKit when track is unpublished/stopped
  }
}

export const noiseProcessor = new NoiseProcessorService()
