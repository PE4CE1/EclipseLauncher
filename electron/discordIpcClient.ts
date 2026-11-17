import { EventEmitter } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_FRAME = 1024 * 1024
function packet(op: number, value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(8)
  header.writeUInt32LE(op); header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

/** Local Discord RPC only: no account token, OAuth or game-process injection. */
export class DiscordIpcClient extends EventEmitter {
  private socket?: net.Socket
  private retired = false
  private ready = false
  private buffer: Buffer = Buffer.alloc(0)
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private readyResolve?: () => void
  private readyReject?: (error: Error) => void

  async login({ clientId }: { clientId: string }): Promise<void> {
    if (!/^\d{1,32}$/.test(clientId)) throw new Error('Invalid Discord application ID')
    for (let index = 0; index < 10 && !this.retired; index++) {
      const prefix = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
      const endpoint = process.platform === 'win32' ? `\\\\?\\pipe\\discord-ipc-${index}` : path.join(prefix, `discord-ipc-${index}`)
      let socket: net.Socket
      try { socket = await this.open(endpoint) } catch { continue }
      if (this.retired) { socket.destroy(); break }
      const ready = new Promise<void>((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject })
      socket.on('data', chunk => this.receive(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      socket.on('error', error => this.disconnect(error))
      socket.on('close', () => this.disconnect(new Error('Discord disconnected')))
      socket.write(packet(0, { v: 1, client_id: clientId }))
      await ready
      return
    }
    throw new Error(this.retired ? 'Discord connection cancelled' : 'Discord desktop client is not running')
  }

  private open(endpoint: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(endpoint)
      this.socket = socket
      const timer = setTimeout(() => fail(new Error('Discord IPC connection timed out')), 800)
      timer.unref?.()
      const cleanup = () => { clearTimeout(timer); socket.removeListener('error', fail); socket.removeListener('close', closed) }
      const fail = (error: Error) => { cleanup(); socket.on('error', () => {}); socket.destroy(); reject(error) }
      const closed = () => fail(new Error('Discord IPC connection closed'))
      socket.once('error', fail); socket.once('close', closed)
      socket.once('connect', () => { cleanup(); resolve(socket) })
    })
  }

  request(command: 'SET_ACTIVITY', args: Record<string, unknown>): Promise<unknown> {
    if (!this.ready || this.retired || !this.socket || this.socket.destroyed) return Promise.reject(new Error('Discord IPC is not ready'))
    const nonce = randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(nonce, { resolve, reject })
      try { this.socket!.write(packet(1, { cmd: command, args, nonce })) }
      catch (error) { this.pending.delete(nonce); reject(error) }
    })
  }

  private receive(chunk: Buffer): void {
    if (this.retired) return
    // IPC may split headers/UTF-8 characters or combine several frames. Keep
    // the decoder's byte state inside this connection, never in shared globals.
    this.buffer = Buffer.concat([this.buffer, chunk])
    try {
      while (this.buffer.length >= 8) {
        const op = this.buffer.readUInt32LE(0), length = this.buffer.readUInt32LE(4)
        if (length > MAX_FRAME) throw new Error('Discord IPC frame exceeds its limit')
        if (this.buffer.length < length + 8) return
        const value = JSON.parse(this.buffer.subarray(8, 8 + length).toString('utf8'))
        this.buffer = this.buffer.subarray(length + 8)
        if (op === 3) { this.socket?.write(packet(4, value)); continue }
        if (op === 2) { this.disconnect(new Error('Discord closed the connection')); return }
        if (op !== 1) continue
        if (value.cmd === 'DISPATCH' && value.evt === 'READY') {
          if (!this.ready) {
            this.ready = true; this.readyResolve?.(); this.readyResolve = undefined; this.readyReject = undefined
            this.emit('ready')
          }
        } else if (typeof value.nonce === 'string') {
          const pending = this.pending.get(value.nonce)
          if (!pending) continue
          this.pending.delete(value.nonce)
          if (value.evt === 'ERROR') pending.reject(Object.assign(new Error(value.data?.message || 'Discord rejected the activity'), { code: value.data?.code }))
          else pending.resolve(value.data)
        }
      }
    } catch (error) { this.disconnect(error instanceof Error ? error : new Error('Invalid Discord IPC response')) }
  }

  private disconnect(error: Error): void {
    if (this.retired) return
    this.retired = true; this.ready = false; this.buffer = Buffer.alloc(0)
    this.readyReject?.(error); this.readyResolve = undefined; this.readyReject = undefined
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear(); this.socket?.destroy()
    this.emit('disconnected')
  }

  async destroy(): Promise<void> { this.disconnect(new Error('Discord connection cancelled')) }
}
