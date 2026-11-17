import { resolveClipAudioSelection, type AudioGame } from '../src/services/clipAudioSelection'
import { app, type WebContents } from 'electron'
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ipcMain } from './ipcSecurity'

export class PcmTimeline {
  private chunks: { time: number; data: Buffer }[] = []
  private bytes = 0
  constructor(private limit = 48 * 1024 * 1024, private retentionMs = 600_000) {}
  setRetention(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 606) throw new Error('Invalid audio retention')
    this.retentionMs = seconds * 1000; this.limit = Math.ceil((seconds + 1) * 192000)
    this.trim(this.chunks.at(-1)?.time)
  }
  private trim(time?: number) {
    let first = 0
    while (first < this.chunks.length && (this.bytes > this.limit || time !== undefined && this.chunks[first].time < time - this.retentionMs)) this.bytes -= this.chunks[first++].data.length
    if (first) this.chunks = this.chunks.slice(first)
  }
  append(time: number, data: Buffer) {
    if(!Number.isFinite(time)||data.length%4||!data.length)return
    this.chunks.push({ time, data: Buffer.from(data) });this.bytes+=data.length
    this.trim(time)
  }
  snapshot(): PcmTimeline {
    const copy = new PcmTimeline(this.limit, this.retentionMs)
    // Appended PCM buffers are immutable; keep references until the queued clip commits.
    copy.chunks = this.chunks.slice(); copy.bytes = this.bytes
    return copy
  }
  wav(start: number, duration: number): Buffer {
    if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0||duration>606)throw new Error('Invalid process audio snapshot')
    const frames=Math.ceil(duration*48000),output=Buffer.alloc(44+frames*4)
    output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(2,22);output.writeUInt32LE(48000,24);output.writeUInt32LE(192000,28);output.writeUInt16LE(4,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(frames*4,40)
    for(const chunk of this.chunks){const offset=Math.round((chunk.time-start)*48),from=Math.max(0,-offset),to=Math.min(chunk.data.length/4,frames-offset);if(to>from)chunk.data.copy(output,44+(offset+from)*4,from*4,to*4)}
    return output
  }
}
const helper=()=>path.join(app.getAppPath(),'electron','native','ProcessAudioCapture.exe').replace(/([\\/])app\.asar([\\/])/i,'$1app.asar.unpacked$2')
export const processAudioSupported=()=>process.platform==='win32'&&Number(os.release().split('.')[2])>=20348&&fs.existsSync(helper())
export async function listAudioProcesses(): Promise<{pid:number;name:string}[]> {
  if(!processAudioSupported())return []
  return new Promise((resolve,reject)=>execFile(helper(),['--list'],{windowsHide:true,timeout:5000,maxBuffer:256*1024,encoding:'utf8'},(error,output)=>{
    if(error){reject(new Error('Audio applications could not be enumerated'));return}
    resolve(output.trim().split(/\r?\n/).flatMap(line=>{const [id,name]=line.split('\t'),pid=Number(id);return Number.isSafeInteger(pid)&&pid>0&&typeof name==='string'&&/^[^\\/\r\n]{1,200}\.exe$/i.test(name)?[{pid,name}]:[]}))
  }))
}
type Capture = { child: ChildProcessWithoutNullStreams; timeline: PcmTimeline; pid: number; active: boolean }
type Channel = 'game' | 'discord'
let audioHistorySeconds = 36
const trackedOwners = new WeakSet<WebContents>()
let captures: Partial<Record<Channel, Capture>> = {}
let timelines: Partial<Record<Channel, PcmTimeline>> = {}
let owner: WebContents | undefined, generation = 0, watch: ReturnType<typeof setInterval> | undefined

function endCapture(capture: Capture) {
  capture.active = false
  try { capture.child.stdin.end() } catch {}
  setTimeout(() => { if (capture.child.exitCode === null) capture.child.kill() }, 1500).unref()
}

export function stopProcessAudio() {
  generation++; clearInterval(watch); watch = undefined
  for (const capture of Object.values(captures)) if (capture) endCapture(capture)
  captures = {}; timelines = {}; owner = undefined
}

function beginCapture(pid: number, timeline: PcmTimeline): Promise<Capture> {
  return new Promise((resolve, reject) => {
    const child = spawn(helper(), ['--capture', String(pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const capture = { child, pid, timeline, active: true }
    let buffer = Buffer.alloc(0), settled = false, diagnostics = ''
    const timeout = setTimeout(() => { fail(); child.kill() }, 6500)
    const fail = () => {
      clearTimeout(timeout); capture.active = false
      if (!settled) { settled = true; reject(new Error('Windows application audio capture is unavailable')) }
    }
    child.once('error', fail); child.once('exit', fail)
    child.stderr.on('data', (data: Buffer) => {
      diagnostics = (diagnostics + data.toString()).slice(-2048)
      if (!settled && diagnostics.includes('READY')) { settled = true; clearTimeout(timeout); resolve(capture) }
    })
    child.stdout.on('data', (data: Buffer) => {
      if (!capture.active) return
      buffer = Buffer.concat([buffer, data])
      if (buffer.length > 2_000_000) { fail(); child.kill(); return }
      while (buffer.length >= 12) {
        const time = buffer.readDoubleLE(0), frames = buffer.readUInt32LE(8), size = 12 + frames * 4
        if (!Number.isFinite(time) || Math.abs(time - Date.now()) > 10_000 || frames > 48000) { fail(); child.kill(); return }
        if (buffer.length < size) break
        timeline.append(time, buffer.subarray(12, size)); buffer = buffer.subarray(size)
      }
    })
  })
}

async function detectedAudioGame(): Promise<AudioGame | null> {
  const monitor = await import('./processMonitor')
  const game = monitor.getCurrentDetectedGame(), pid = monitor.getCurrentDetectedGamePid()
  if (!game || !Number.isSafeInteger(pid) || pid <= 0) return null
  try { process.kill(pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null }
  return { name: game.name, exeName: game.exeName, pid }
}

export function freezeProcessAudio(sender?: WebContents): Partial<Record<Channel, PcmTimeline>> {
  if (owner && sender !== owner) return {}
  return Object.fromEntries(Object.entries(timelines).map(([kind, timeline]) => [kind, timeline!.snapshot()]))
}
export function snapshotProcessAudio(kind: Channel, file: string, start: number, duration: number, frozen?: Partial<Record<Channel, PcmTimeline>>): boolean {
  const timeline = frozen ? frozen[kind] : timelines[kind]
  if (!timeline) return false
  fs.writeFileSync(file, timeline.wav(start, duration)); return true
}

export function initProcessAudioCapture() {
  ipcMain.handle('clips:audio-history', (event, seconds: number) => {
    if (owner !== event.sender) return false
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 606) throw new Error('Invalid audio retention')
    audioHistorySeconds = seconds
    for (const timeline of Object.values(timelines)) timeline?.setRetention(seconds)
    return true
  })
  ipcMain.handle('clips:audio-processes', async () => {
    const [processes, detectedGame] = await Promise.all([listAudioProcesses(), detectedAudioGame()])
    return { supported: processAudioSupported(), processes, detectedGame }
  })
  ipcMain.handle('clips:audio-stop', event => { if (owner === event.sender) stopProcessAudio(); return true })
  ipcMain.handle('clips:audio-prepare', async (event, selection: { game?: string; discord?: boolean; historySeconds?: number }) => {
    if (!selection || typeof selection.game !== 'string' || selection.game.length > 200 || !['auto', 'none'].includes(selection.game) && !/^[^\\/\r\n]{1,195}\.exe$/i.test(selection.game) || typeof selection.discord !== 'boolean' || typeof selection.historySeconds !== 'number' || !Number.isFinite(selection.historySeconds) || selection.historySeconds < 5 || selection.historySeconds > 606) return { success: false, error: 'Invalid audio application selection' }
    stopProcessAudio()
    audioHistorySeconds = selection.historySeconds
    if (!processAudioSupported()) return { success: false, error: 'Application audio requires Windows build 20348 or newer' }
    const token = generation
    owner = event.sender
    const errors = new Set<string>(), availability: Partial<Record<Channel, boolean>> = {}
    let refreshing = false, retrySource = false
    const report = (kind: Channel, available: boolean) => {
      if (availability[kind] === available || token !== generation || event.sender.isDestroyed()) return
      availability[kind] = available; event.sender.send('clips:audio-status', { channel: kind, available })
    }
    const refresh = async (): Promise<void> => {
      if (refreshing || token !== generation) return
      if (event.sender.isDestroyed()) { stopProcessAudio(); return }
      refreshing = true
      try {
        const [applications, game] = await Promise.all([listAudioProcesses().catch(() => null), detectedAudioGame()])
        const selected = resolveClipAudioSelection(selection.game, applications, game)
        // Once a missing saved target falls back, follow the new game for this
        // recording session rather than snapping back if the old app reappears.
        if (selected.fallback) selection = { ...selection, game: 'auto' }
        const discord = selection.discord ? applications?.find(item => /^discord(?:ptb|canary)?\.exe$/i.test(item.name))?.pid : undefined
        for (const [kind, pid] of [['game', selected.pid], ['discord', discord]] as const) {
          if (token !== generation || event.sender.isDestroyed()) return
          if (kind === 'game' && selected.mode === 'unknown' || kind === 'discord' && selection.discord && !applications) continue
          const current = captures[kind]
          if (pid && !(kind === 'discord' && pid === selected.pid) && current?.pid === pid && current.active && current.child.exitCode === null && !current.child.killed) continue
          if (current) { endCapture(current); delete captures[kind] }
          report(kind, false)
          if (!pid || kind === 'discord' && pid === selected.pid) continue
          const timeline = timelines[kind] ||= new PcmTimeline(Math.ceil((audioHistorySeconds + 1) * 192000), audioHistorySeconds * 1000)
          try {
            const next = await beginCapture(pid, timeline)
            if (token !== generation || event.sender.isDestroyed()) { endCapture(next); return }
            if (kind === 'game' && selected.mode === 'auto') {
              const latest = await detectedAudioGame()
              if (token !== generation || event.sender.isDestroyed()) { endCapture(next); return }
              if (latest?.pid !== pid || latest.name !== game?.name) { endCapture(next); retrySource = true; continue }
            }
            captures[kind] = next; report(kind, true)
          } catch { errors.add(kind + ' audio could not start') }
        }
      } finally {
        refreshing = false
        if (retrySource && token === generation) { retrySource = false; await refresh() }
      }
    }
    try { await refresh() } catch {
      if (token === generation) stopProcessAudio()
      return { success: false, error: 'Audio applications could not be resolved' }
    }
    if (token !== generation || event.sender.isDestroyed()) return { success: false, error: 'Audio capture cancelled' }
    if (!trackedOwners.has(event.sender)) { trackedOwners.add(event.sender); event.sender.once('destroyed', () => { if (owner === event.sender) stopProcessAudio() }) }
    watch = setInterval(() => { void refresh().catch(() => {}) }, 3000); watch.unref()
    return { success: true, game: !!captures.game, discord: !!captures.discord, error: [...errors].join('; ') || undefined }
  })
  app.once?.('before-quit', stopProcessAudio)
}
