import type { DiscordActivity } from './discordActivity'

export interface DiscordClient {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeAllListeners(): unknown
  login(options: { clientId: string }): Promise<unknown>
  setActivity(activity: DiscordActivity): Promise<unknown>
  clearActivity(): Promise<unknown>
  destroy(): Promise<unknown>
}

/** One connection and one write in flight; only the latest requested state survives. */
export class DiscordConnection {
  private client: DiscordClient | null = null
  private clientId = ''
  private ready = false
  private generation = 0
  private desired: DiscordActivity | null = null
  private desiredKey = 'null'
  private sentKey = ''
  private lastWrite = -Infinity
  private lastConfirmed = -Infinity
  private busy = false
  private failures = 0
  private retryAt = 0
  private timer?: ReturnType<typeof setTimeout>
  private timerAt = Infinity
  private deadline?: ReturnType<typeof setTimeout>

  constructor(private factory: () => DiscordClient, private minInterval = 4000, private refreshInterval = 60_000) {}

  publish(activity: DiscordActivity | null, clientId: string): void {
    if (clientId !== this.clientId && this.client) this.drop()
    this.clientId = clientId
    this.desired = activity
    this.desiredKey = JSON.stringify(activity)
    if (!activity) {
      this.retryAt = 0; this.failures = 0
      clearTimeout(this.timer); this.timer = undefined; this.timerAt = Infinity
      // A not-yet-ready connection must not publish a game after being disabled.
      if (!this.ready) { this.drop(); return }
    }
    this.pump()
  }

  refresh(): void { this.pump() }

  private schedule(delay: number): void {
    const wait = Math.max(1, delay), at = Date.now() + wait
    if (this.timer && this.timerAt <= at) return
    clearTimeout(this.timer)
    this.timerAt = at
    this.timer = setTimeout(() => { this.timer = undefined; this.timerAt = Infinity; this.pump() }, wait)
    this.timer.unref?.()
  }

  private drop(): void {
    this.generation++
    clearTimeout(this.deadline); this.deadline = undefined
    clearTimeout(this.timer); this.timer = undefined; this.timerAt = Infinity
    const previous = this.client
    this.client = null; this.ready = false; this.busy = false; this.sentKey = ''; this.lastWrite = -Infinity; this.lastConfirmed = -Infinity
    if (previous) {
      previous.removeAllListeners()
      // Old clients can still emit an error while their transport is closing.
      previous.on('error', () => {})
      try { void previous.destroy().catch(() => {}) } catch {}
    }
  }

  private fail(generation: number): void {
    if (generation !== this.generation) return
    this.drop()
    this.retryAt = Date.now() + Math.min(30_000, 5000 * 2 ** Math.min(this.failures++, 3))
    if (this.desired) this.schedule(this.retryAt - Date.now())
  }

  private connect(): void {
    if (!this.desired) return
    if (Date.now() < this.retryAt) { this.schedule(this.retryAt - Date.now()); return }
    let client: DiscordClient
    const generation = ++this.generation
    try { client = this.factory() } catch { this.fail(generation); return }
    this.client = client
    this.deadline = setTimeout(() => this.fail(generation), 12_000)
    this.deadline.unref?.()
    client.on('ready', () => {
      if (generation !== this.generation || this.client !== client) return
      clearTimeout(this.deadline); this.deadline = undefined
      this.ready = true; this.failures = 0; this.retryAt = 0; this.sentKey = ''
      this.pump()
    })
    for (const event of ['disconnected', 'close', 'error']) client.on(event, () => this.fail(generation))
    try { void client.login({ clientId: this.clientId }).catch(() => this.fail(generation)) }
    catch { this.fail(generation) }
  }

  private pump(): void {
    if (this.busy) return
    if (!this.client) { if (this.desired) this.connect(); return }
    if (!this.ready) return
    if (this.sentKey === this.desiredKey && this.desired) {
      const remaining = this.refreshInterval - (Date.now() - this.lastConfirmed)
      if (remaining > 0) { this.schedule(remaining); return }
    } else if (this.sentKey === this.desiredKey) return
    const delay = this.desired ? this.minInterval - (Date.now() - this.lastWrite) : 0
    if (delay > 0) { this.schedule(delay); return }
    clearTimeout(this.timer); this.timer = undefined; this.timerAt = Infinity
    const generation = this.generation, client = this.client, activity = this.desired, key = this.desiredKey
    this.busy = true; this.lastWrite = Date.now()
    this.deadline = setTimeout(() => this.fail(generation), 8000)
    this.deadline.unref?.()
    let write: Promise<unknown>
    try { write = activity ? client.setActivity(activity) : client.clearActivity() }
    catch { this.fail(generation); return }
    void Promise.resolve(write).then(() => {
      if (generation !== this.generation) return
      this.sentKey = key
      this.lastConfirmed = Date.now()
      // Closing after a successful clear also prevents late native/ready events
      // from resurrecting an activity while Rich Presence is switched off.
      if (!this.desired && key === 'null') this.drop()
    }, () => this.fail(generation)).finally(() => {
      if (generation !== this.generation) return
      clearTimeout(this.deadline); this.deadline = undefined; this.busy = false
      this.pump()
    })
  }

  stop(): void {
    this.desired = null; this.desiredKey = 'null'; this.retryAt = 0; this.failures = 0
    this.drop()
  }
}
