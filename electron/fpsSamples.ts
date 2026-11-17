/** Incremental PresentMon CSV reader. A game's multiple swap chains must not
 * be added together: select the most active recent chain of the target PID. */
export class FpsSamples {
  private tail = ''
  private columns: string[] = []
  private chains = new Map<string, Array<{ at: number; duration: number }>>()
  private lastFrameAt = 0

  constructor(private readonly pid: number) {}

  push(chunk: string, now = Date.now()): void {
    this.tail += chunk
    if (this.tail.length > 256 * 1024) { this.tail = ''; return }
    const lines = this.tail.split(/\r?\n/)
    this.tail = lines.pop() || ''
    for (const line of lines) {
      const cells = line.match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g)?.filter(Boolean)
        .map(cell => cell.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || []
      if (cells.some(cell => cell.toLowerCase() === 'processid')) { this.columns = cells.map(cell => cell.toLowerCase()); continue }
      if (!this.columns.length) continue
      const value = (name: string) => cells[this.columns.indexOf(name)]
      if (Number(value('processid')) !== this.pid) continue
      const duration = Number(value('msbetweenpresents'))
      if (!Number.isFinite(duration) || duration <= 0 || duration > 2000) continue
      const address = value('swapchainaddress') || 'primary'
      let samples = this.chains.get(address)
      if (!samples) { samples = []; this.chains.set(address, samples) }
      samples.push({ at: now, duration })
      while (samples.length > 1500 || (samples[0] && now - samples[0].at > 1400)) samples.shift()
      this.lastFrameAt = now
      while (this.chains.size > 8) this.chains.delete(this.chains.keys().next().value!)
    }
  }

  read(now = Date.now()): { fps: number; frameTimeMs: number } | undefined {
    if (!this.lastFrameAt || now - this.lastFrameAt > 2500) return undefined
    let best: Array<{ at: number; duration: number }> = []
    for (const [address, samples] of this.chains) {
      while (samples[0] && now - samples[0].at > 1400) samples.shift()
      if (!samples.length) this.chains.delete(address)
      else if (samples.length > best.length) best = samples
    }
    if (best.length < 2) return undefined
    const frameTimeMs = best.reduce((sum, sample) => sum + sample.duration, 0) / best.length
    return { fps: Math.round(10000 / frameTimeMs) / 10, frameTimeMs: Math.round(frameTimeMs * 100) / 100 }
  }
}
