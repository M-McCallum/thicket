// RNNoise AudioWorklet processor code (inlined as string for blob URL registration).
// Buffers 128-sample AudioWorklet blocks into 480-sample RNNoise frames,
// round-trips them to the main thread for WASM processing via MessagePort.

export const RNNOISE_PROCESSOR_NAME = 'rnnoise-processor'

export const rnnoiseProcessorCode = /* js */ `
class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // RNNoise processes 480 samples at a time (10ms @ 48kHz)
    this._frameSize = 480
    this._inputBuf = new Float32Array(this._frameSize)
    this._inputOffset = 0
    this._outputBuf = new Float32Array(this._frameSize)
    this._outputOffset = 0
    this._hasOutput = false

    this.port.onmessage = (e) => {
      if (e.data.type === 'processed') {
        this._outputBuf = new Float32Array(e.data.frame)
        this._outputOffset = 0
        this._hasOutput = true
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (!input || !output) return true

    // Accumulate input samples into frame buffer
    let srcOffset = 0
    while (srcOffset < input.length) {
      const space = this._frameSize - this._inputOffset
      const n = Math.min(input.length - srcOffset, space)
      this._inputBuf.set(input.subarray(srcOffset, srcOffset + n), this._inputOffset)
      this._inputOffset += n
      srcOffset += n

      if (this._inputOffset >= this._frameSize) {
        // Send full frame to main thread for RNNoise processing
        this.port.postMessage({ type: 'frame', frame: this._inputBuf.buffer.slice(0) }, [])
        this._inputOffset = 0
      }
    }

    // Output processed audio (one-frame pipeline delay)
    if (this._hasOutput) {
      const avail = this._frameSize - this._outputOffset
      const n = Math.min(output.length, avail)
      output.set(this._outputBuf.subarray(this._outputOffset, this._outputOffset + n))
      this._outputOffset += n
      if (this._outputOffset >= this._frameSize) {
        this._hasOutput = false
      }
    }
    // else: output stays zeroed (silence) — happens only for the first frame

    return true
  }
}

registerProcessor('${RNNOISE_PROCESSOR_NAME}', RnnoiseProcessor)
`
