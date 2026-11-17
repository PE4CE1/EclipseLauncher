// Runs on the audio rendering thread, independently of scrolling, React and clip saving.
class EclipseMicGate extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.threshold = -40
    this.open = false
    this.gain = 0
    this.hold = 0
    this.reporting = !!options.processorOptions?.meter
    this.reportSamples = 0
    this.reportEnergy = 0
    this.disposed = false
    this.attack = 1 - Math.exp(-1 / (sampleRate * .004))
    this.release = 1 - Math.exp(-1 / (sampleRate * .04))
    this.configure(options.processorOptions?.threshold)
    this.port.onmessage = event => {
      if (event.data?.dispose) this.disposed = true
      else this.configure(event.data?.threshold)
    }
  }
  configure(value) {
    this.threshold = Number.isFinite(value) ? Math.max(-60, Math.min(-10, value)) : -40
    this.openLevel = Math.pow(10, this.threshold / 20)
    this.closeLevel = Math.pow(10, (this.threshold - 3) / 20)
    if (this.threshold <= -60) { this.open = true; this.gain = 1 }
  }
  process(inputs, outputs) {
    if (this.disposed) return false
    const input = inputs[0] || [], output = outputs[0] || []
    const frames = output[0]?.length || 128
    let energy = 0
    // Use the strongest input channel so a one-sided microphone is not measured 3 dB lower.
    for (const channel of input) {
      let channelEnergy = 0
      for (let i = 0; i < channel.length; i++) channelEnergy += channel[i] * channel[i]
      energy = Math.max(energy, channelEnergy)
    }
    const rms = Math.sqrt(energy / frames)
    if (this.threshold <= -60 || rms >= this.openLevel || (this.open && rms >= this.closeLevel)) {
      this.open = true
      this.hold = sampleRate * .35
    } else {
      this.hold = Math.max(0, this.hold - frames)
      if (this.hold === 0) this.open = false
    }
    const target = this.open ? 1 : 0, smoothing = this.open ? this.attack : this.release
    for (let i = 0; i < frames; i++) {
      this.gain += (target - this.gain) * smoothing
      for (let channel = 0; channel < output.length; channel++) {
        const source = input[channel] || (input.length === 1 ? input[0] : undefined)
        output[channel][i] = (source?.[i] || 0) * this.gain
      }
    }
    if (this.reporting) {
      this.reportSamples += frames; this.reportEnergy += energy
      if (this.reportSamples >= sampleRate / 20) {
        const level = Math.sqrt(this.reportEnergy / this.reportSamples)
        this.port.postMessage({ db: Math.max(-60, Math.min(0, 20 * Math.log10(level || 1e-8))), open: this.open })
        this.reportSamples = 0; this.reportEnergy = 0
      }
    }
    return true
  }
}
registerProcessor('eclipse-mic-gate', EclipseMicGate)
