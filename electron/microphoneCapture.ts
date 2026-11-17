import { app, type WebContents } from 'electron'
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { ipcMain } from './ipcSecurity'
import type { NativeMicrophoneDevice } from '../src/types/microphone'

const helper = () => path.join(app.getAppPath(), 'electron/native/ProcessAudioCapture.apo.exe').replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2')
const sessions = new Map<string, { owner: WebContents; child: ChildProcessWithoutNullStreams; pending: Map<number, number>; stop: () => void }>()
const owners = new WeakSet<WebContents>()
export function parseNativeMicrophones(output: string): NativeMicrophoneDevice[] {
  return output.split(/\r?\n/).flatMap(line => {
    const [id, label, current] = line.split('\t')
    return id && id.length < 1000 && label && label.length < 500 && /^[01]$/.test(current)
      ? [{ deviceId: 'wasapi:' + id, label, default: current === '1' }] : []
  })
}
export function initMicrophoneCapture() {
  ipcMain.on?.('microphone:ack', (event, id: string, sequence: number) => {
    const session = sessions.get(id)
    if (session?.owner === event.sender && Number.isSafeInteger(sequence)) session.pending.delete(sequence)
  })
  ipcMain.handle('microphone:list', async () => {
    if (process.platform !== 'win32' || !fs.existsSync(helper())) return { supported: false, inputs: [] }
    const output = await new Promise<string>((resolve, reject) => execFile(helper(), ['--list-inputs'], { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024, encoding: 'utf8' }, (error, value) => error ? reject(error) : resolve(value)))
    return { supported: true, inputs: parseNativeMicrophones(output) }
  })
  ipcMain.handle('microphone:stop', (event, id: string) => { const session = sessions.get(id); if (session?.owner === event.sender) session.stop() })
  ipcMain.handle('microphone:start', async (event, id: string, deviceId: string) => {
    if (process.platform !== 'win32' || typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id) || sessions.has(id) || typeof deviceId !== 'string'
      || deviceId !== 'auto' && (!deviceId.startsWith('wasapi:') || deviceId.length > 1006 || /[\r\n\0]/.test(deviceId))) throw new Error('Invalid microphone capture request')
    if (!owners.has(event.sender)) {
      owners.add(event.sender)
      const release = () => { for (const session of sessions.values()) if (session.owner === event.sender) session.stop() }
      event.sender.once('destroyed', release)
      event.sender.on('render-process-gone', release)
      // WebContents survives a reload; its old document and PCM consumers do not.
      event.sender.on('did-start-navigation', (details: { isMainFrame?: boolean; isSameDocument?: boolean }) => {
        if (details.isMainFrame && !details.isSameDocument) release()
      })
    }
    if ([...sessions.values()].filter(value => value.owner === event.sender).length >= 2 || sessions.size >= 4)
      throw new Error('[MICROPHONE_BUSY] Microphone capture slots are already in use')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(helper(), ['--microphone', deviceId === 'auto' ? 'auto' : deviceId.slice(7)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let settled = false, stopped = false, buffer = Buffer.alloc(0), diagnostics = '', sequence = 0
      const pending = new Map<number, number>()
      const timeout = setTimeout(() => { stop(); if (!settled) { settled = true; reject(new Error('The Windows microphone did not become ready')) } }, 6000)
      const stop = () => {
        if (stopped) return
        stopped = true; clearTimeout(timeout); sessions.delete(id)
        child.stdin.on('error', () => {}); child.stdin.end()
        const kill = setTimeout(() => { if (child.exitCode === null) child.kill() }, 1500); kill.unref()
        child.once('exit', () => clearTimeout(kill))
        if (!settled) { settled = true; reject(new Error('Microphone capture cancelled')) }
      }
      sessions.set(id, { owner: event.sender, child, pending, stop })
      const failed = () => {
        if (!settled) { settled = true; reject(new Error('The Windows microphone could not be opened. Check the input device and Windows microphone access.')) }
        if (!stopped && !event.sender.isDestroyed()) event.sender.send('microphone:data', { id, ended: true })
        stop()
      }
      child.once('error', failed); child.once('exit', failed)
      child.stderr.on('data', data => {
        diagnostics = (diagnostics + data.toString()).slice(-2048)
        if (!stopped && !settled && diagnostics.includes('READY')) { settled = true; clearTimeout(timeout); resolve() }
      })
      child.stdout.on('data', (chunk: Buffer) => {
        if (stopped || event.sender.isDestroyed()) return
        buffer = Buffer.concat([buffer, chunk])
        if (buffer.length > 2_000_000) { failed(); return }
        while (buffer.length >= 12) {
          const time = buffer.readDoubleLE(0), frames = buffer.readUInt32LE(8), bytes = 12 + frames * 4
          if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 10000 || !frames || frames > 48000) { failed(); return }
          if (buffer.length < bytes) break
          // A stalled renderer must not accumulate an unbounded IPC audio queue.
          if (pending.size < 24 && [...pending.values()].reduce((sum, value) => sum + value, 0) < 96000) {
            const next = ++sequence
            pending.set(next, frames * 4)
            event.sender.send('microphone:data', { id, sequence: next, pcm: Uint8Array.from(buffer.subarray(12, bytes)) })
          }
          buffer = buffer.subarray(bytes)
        }
      })
    })
  })
  app.once?.('before-quit', () => { for (const session of sessions.values()) session.stop() })
}
