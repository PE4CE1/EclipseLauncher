import { spawn, type ChildProcess } from 'node:child_process'
import os from 'node:os'

/** Keep the driver connection open. Repeated nvidia-smi launches can create
 * periodic CPU/driver spikes even though the HUD itself only changes once a second. */
export class GpuMetricsReader {
  private child: ChildProcess | null = null
  private generation = 0
  private tail = ''
  private value: number | undefined
  private updatedAt = 0
  private startedAt = 0
  private retryAt = 0

  read(now = Date.now()): number | undefined {
    if (this.child && now - (this.updatedAt || this.startedAt) > 10_000) this.fail(now)
    if (!this.child && now >= this.retryAt) this.start(now)
    return this.updatedAt && now - this.updatedAt <= 6000 ? this.value : undefined
  }

  private start(now: number): void {
    const token = ++this.generation
    this.startedAt = now
    try {
      const child = spawn('nvidia-smi', ['--id=0', '--query-gpu=utilization.gpu', '--format=csv,noheader,nounits', '--loop-ms=2000'], { windowsHide: true, stdio: ['ignore','pipe','ignore'] })
      this.child = child
      child.once('spawn', () => {
        if (token !== this.generation || !child.pid) return
        try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* Sampling still works if priority cannot be changed. */ }
      })
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        if (token !== this.generation) return
        this.tail += chunk
        if (this.tail.length > 8192) { this.fail(); return }
        const lines = this.tail.split(/\r?\n/)
        this.tail = lines.pop() || ''
        for (const line of lines) {
          if (!/^\s*\d{1,3}\s*$/.test(line)) continue
          const value = Number(line.trim())
          if (value > 100) continue
          this.value = value
          this.updatedAt = Date.now()
        }
      })
      child.once('error', error => {
        if (token !== this.generation) return
        this.fail()
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.retryAt = Infinity
      })
      child.once('exit', () => { if (token === this.generation) this.fail() })
    } catch { this.fail(now) }
  }

  private fail(now = Date.now()): void { this.stop(); this.retryAt = now + 60_000 }

  stop(): void {
    this.generation++
    const child = this.child
    this.child = null
    this.tail = ''
    this.value = undefined
    this.updatedAt = 0
    this.startedAt = 0
    this.retryAt = 0
    child?.kill()
  }
}
