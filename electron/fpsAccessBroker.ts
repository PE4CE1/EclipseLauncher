import net, { type Socket, type Server } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'

export type FpsAccessResult = { success: boolean; error?: 'cancelled' | 'unavailable' | 'timeout' }
type Status = 'starting' | 'permission-required' | 'unavailable' | 'no-frames' | 'error'

/** One explicit UAC approval per launcher session. Only the native FPS collector
 * gains elevation; its pipe closes with Eclipse and stops its owned ETW session. */
export class FpsAccessBroker {
  ready = false
  private server?: Server
  private socket?: Socket
  private launcher?: ChildProcess
  private targetPid = 0
  private buffer = ''
  private closed = false
  private request?: Promise<FpsAccessResult>
  private finishRequest?: (result: FpsAccessResult) => void
  get activating(): boolean { return !!this.finishRequest }

  constructor(private readonly onData: (pid: number, csv: string) => void,
    private readonly onStatus: (pid: number, status: Status) => void) {}

  activate(executable: string): Promise<FpsAccessResult> {
    if (this.closed) return Promise.resolve({ success: false, error: 'unavailable' })
    if (this.ready) return Promise.resolve({ success: true })
    if (this.request) return this.request
    this.request = new Promise(resolve => {
      const timer = setTimeout(() => { this.finishRequest?.({ success: false, error: 'timeout' }); this.close() }, 90000)
      timer.unref()
      this.finishRequest = result => { clearTimeout(timer); this.finishRequest = undefined; resolve(result) }
      const name = `EclipseFps_${randomBytes(16).toString('hex')}`
      this.server = net.createServer(socket => this.connect(socket))
      this.server.once('error', () => { this.finishRequest?.({ success: false, error: 'unavailable' }); this.close() })
      this.server.listen('\\\\.\\pipe\\' + name, () => {
        if (this.closed) { this.server?.close(); return }
        this.launcher = spawn(executable, [name, String(process.pid)], { windowsHide: true, stdio: 'ignore' })
        this.launcher.once('error', () => { this.finishRequest?.({ success: false, error: 'unavailable' }); this.close() })
        this.launcher.once('exit', code => {
          this.finishRequest?.({ success: false, error: code === 1223 ? 'cancelled' : 'unavailable' })
          this.disconnect()
        })
      })
    })
    return this.request
  }

  setTarget(pid: number): void {
    this.targetPid = Number.isSafeInteger(pid) && pid > 0 ? pid : 0
    if (this.ready) this.socket?.write(`target:${this.targetPid}\n`)
  }

  private connect(socket: Socket): void {
    if (this.closed || this.socket) { socket.destroy(); return }
    this.socket = socket
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      this.buffer += chunk
      if (this.buffer.length > 256 * 1024) { this.disconnect(); return }
      const lines = this.buffer.split(/\r?\n/)
      this.buffer = lines.pop() || ''
      let csv = ''
      const flush = () => { if (csv) { this.onData(this.targetPid, csv); csv = '' } }
      for (const line of lines) {
        if (line === '!ready') {
          this.ready = true
          this.finishRequest?.({ success: true })
          this.socket?.write(`target:${this.targetPid}\n`)
          continue
        }
        const match = /^!(csv|status)\t(\d+)\t(.*)$/.exec(line)
        if (!match || Number(match[2]) !== this.targetPid || !this.targetPid) continue
        if (match[1] === 'csv') csv += match[3] + '\n'
        else if (['permission-required', 'unavailable', 'no-frames', 'error'].includes(match[3])) { flush(); this.onStatus(this.targetPid, match[3] as Status) }
      }
      flush()
    })
    socket.once('error', () => this.disconnect())
    socket.once('close', () => this.disconnect())
  }

  private disconnect(): void {
    if (this.closed) return
    const pid = this.targetPid
    this.finishRequest?.({ success: false, error: 'unavailable' })
    this.close()
    if (pid) this.onStatus(pid, 'permission-required')
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.ready = false
    this.finishRequest?.({ success: false, error: 'unavailable' })
    this.socket?.end('close\n')
    const socket = this.socket
    if (socket) { const timer = setTimeout(() => socket.destroy(), 2000); timer.unref() }
    if (this.server?.listening) this.server.close()
  }
}
