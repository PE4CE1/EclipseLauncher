import { EventEmitter } from 'node:events'
import { createConnection, type Socket } from 'node:net'
import { setExternalBroker } from './externalLaunch'

const inheritedPipe = process.env.ECLIPSE_MEMORY_PIPE
delete process.env.ECLIPSE_MEMORY_PIPE
let socket: Socket | undefined
let started: Promise<void> | undefined
let closed = false, sequence = 0
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
const children = new Map<number, EventEmitter>()
const earlyExits = new Set<number>()
const hex = (value: string) => Buffer.from(value, 'utf8').toString('hex')

function request<T>(command: string, args: string[] = []): Promise<T> {
  if (!socket || closed) return Promise.reject(new Error('The legacy launch channel is unavailable. Restart Eclipse.'))
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Legacy launch channel timed out')) }, 8000)
    pending.set(id, { resolve, reject, timer })
    socket!.write([id, command, ...args].join('\t') + '\n', error => {
      if (!error) return
      clearTimeout(timer); pending.delete(id); reject(error)
    })
  })
}

/** Only upgrades inherited from the retired limiter need this channel. Fresh
 * launches create no job or helper. Even after release, Windows job membership
 * lasts until exit, so external games and installers still use the old broker. */
export function releaseInheritedMemoryLimits(): Promise<void> {
  if (started) return started
  if (!inheritedPipe || process.platform !== 'win32') return Promise.resolve()
  setExternalBroker({
    async open(url) { await request('OPEN', [hex(url)]) },
    async spawn(exe, args, cwd) {
      const { pid } = await request<{ pid: number }>('SPAWN', [hex(exe), hex(cwd), ...args.map(hex)])
      const emitter = new EventEmitter()
      const handle = Object.assign(emitter, { pid, unref() {} })
      if (earlyExits.delete(pid)) setImmediate(() => emitter.emit('exit'))
      else children.set(pid, emitter)
      return handle
    },
    async relaunch(exe, args, cwd) {
      if (!socket || closed) throw new Error('The legacy launch channel is unavailable')
      // The old broker waits for our exit before restarting outside the job.
      await new Promise<void>((resolve, reject) => socket!.write([++sequence, 'RELAUNCH', hex(exe), hex(cwd), ...args.map(hex)].join('\t') + '\n', error => error ? reject(error) : resolve()))
    },
  })
  started = (async () => {
    if (!/^\\\\\.\\pipe\\Eclipse-memory-[a-f0-9]{32}$/.test(inheritedPipe)) throw new Error('Invalid private legacy channel')
    socket = createConnection(inheritedPipe)
    let buffer = ''
    const fail = (error: Error) => {
      closed = true
      for (const value of pending.values()) { clearTimeout(value.timer); value.reject(error) }
      pending.clear()
    }
    socket.on('error', fail)
    socket.once('close', () => fail(new Error('The legacy launch channel closed. Restart Eclipse.')))
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > 262144) { fail(new Error('Invalid legacy channel response')); socket?.destroy(); return }
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const result = JSON.parse(line)
          if (result.event === 'exit' && Number.isSafeInteger(result.pid)) {
            const child = children.get(result.pid)
            if (child) { children.delete(result.pid); child.emit('exit') }
            else { if (earlyExits.size >= 64) earlyExits.clear(); earlyExits.add(result.pid) }
            continue
          }
          const value = pending.get(result.id)
          if (value) {
            pending.delete(result.id); clearTimeout(value.timer)
            if (result.error) {
              const error = new Error(result.error) as NodeJS.ErrnoException
              const code = /Windows (\d+)/.exec(result.error)?.[1]
              if (code === '5' || code === '740') error.code = 'EACCES'
              else if (code === '2' || code === '3') error.code = 'ENOENT'
              value.reject(error)
            } else value.resolve(result.data)
          }
        } catch { fail(new Error('Invalid legacy channel response')); socket?.destroy(); return }
      }
    })
    const snapshot = await request<{ ramLimitMB?: number }>('SAMPLE', [String(process.pid)])
    // No positive quota commands remain; release both generations of limits.
    try { if (snapshot.ramLimitMB !== undefined) await request('RAM', ['0']) }
    finally { await request('LIMIT', ['0']) }
  })().catch(error => { console.error('[Memory] Could not release inherited limits. Restart Eclipse:', error) })
  return started
}
