class NativeMicrophone extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Int16Array(48000)
    this.read = 0; this.write = 0; this.count = 0; this.started = false
    this.port.onmessage = ({ data }) => {
      const pcm = new Int16Array(data)
      if (pcm.length % 2) return
      for (let i = 0; i < pcm.length; i += 2) {
        if (this.count >= this.samples.length / 2) { this.read = (this.read + 2) % this.samples.length; this.count-- }
        this.samples[this.write] = pcm[i]; this.samples[this.write + 1] = pcm[i + 1]
        this.write = (this.write + 2) % this.samples.length; this.count++
      }
      if (this.count >= 2400) this.started = true
    }
  }
  process(_inputs, outputs) {
    const channels = outputs[0]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      if (!this.started || !this.count) { for (const channel of channels) channel[i] = 0; continue }
      channels[0][i] = this.samples[this.read] / 32768
      if (channels[1]) channels[1][i] = this.samples[this.read + 1] / 32768
      this.read = (this.read + 2) % this.samples.length; this.count--
    }
    return true
  }
}
registerProcessor('eclipse-native-microphone', NativeMicrophone)
