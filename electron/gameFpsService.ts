import { app } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { FpsSamples } from './fpsSamples'
import { FpsAccessBroker, type FpsAccessResult } from './fpsAccessBroker'

export type GameFpsStatus = 'idle' | 'starting' | 'ready' | 'no-frames' | 'permission-required' | 'unavailable' | 'error'
let child: ChildProcess | null = null
let targetPid = 0
let status: GameFpsStatus = 'idle'
let samples: FpsSamples | null = null
let generation = 0
let executable = ''
let sessionName = ''
let startedAt = 0
let broker: FpsAccessBroker | null = null
let accessRequest: Promise<FpsAccessResult> | null = null

function findExecutable(filename = 'PresentMon.exe'): string | undefined {
  const candidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked/electron/native/PresentMon', filename),
    path.join(app.getAppPath(), 'electron/native/PresentMon', filename),
    path.join(__dirname, '../electron/native/PresentMon', filename),
  ]
  return candidates.find(candidate => fs.existsSync(candidate))
}

export function startGameFpsMonitor(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0 || process.platform !== 'win32' || process.arch !== 'x64') { stopGameFpsMonitor(); return }
  if (targetPid === pid && status !== 'idle') return
  stopGameFpsMonitor()
  targetPid = pid
  if (broker?.ready) {
    samples = new FpsSamples(pid)
    status = 'starting'
    startedAt = Date.now()
    broker.setTarget(pid)
    return
  }
  executable = findExecutable() || ''
  if (!executable) { status = 'unavailable'; return }
  const token = ++generation
  samples = new FpsSamples(pid)
  status = 'starting'
  startedAt = Date.now()
  sessionName = `EclipseFps_${process.pid}_${pid}_${token}`
  const ownSession = sessionName
  let stderr = ''
  try {
    const processHandle = spawn(executable, [
      '--process_id', String(pid), '--output_stdout', '--no_console_stats',
      '--no_track_display', '--no_track_gpu', '--no_track_input', '--v1_metrics',
      '--session_name', ownSession, '--terminate_on_proc_exit',
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child = processHandle
    processHandle.stdout?.on('data', data => { if (token === generation) samples?.push(data.toString()) })
    processHandle.stderr?.on('data', data => {
      if (token !== generation) return
      stderr = (stderr + data.toString()).slice(-4096)
      if (/access denied|administrative privileges|performance log users|elevated privilege.*required/i.test(stderr)) status = 'permission-required'
    })
    processHandle.once('error', () => { if (token === generation) { status = 'unavailable'; child = null } })
    processHandle.once('exit', code => {
      if (token !== generation) return
      child = null
      samples = null
      if (status !== 'permission-required') status = code === 0 ? 'no-frames' : 'error'
    })
  } catch { status = 'unavailable'; child = null }
}

export function stopGameFpsMonitor(): void {
  generation++
  const previous = child
  child = null
  targetPid = 0
  samples = null
  status = 'idle'
  if (broker?.ready) broker.setTarget(0)
  const ownedSession = sessionName
  sessionName = ''
  if (!previous) return
  // Stop only our ETW session so the collector can close normally. No CSV file,
  // driver, global session shutdown, service installation or UAC prompt is used.
  const killTimer = setTimeout(() => { if (previous.exitCode === null && !previous.killed) previous.kill() }, 1800)
  killTimer.unref()
  previous.once('exit', () => clearTimeout(killTimer))
  execFile(executable, ['--session_name', ownedSession, '--terminate_existing_session'], { windowsHide: true, timeout: 1500 }, () => {})
}

export function getGameFpsSnapshot() {
  const reading = samples?.read()
  const currentStatus: GameFpsStatus = reading ? 'ready' : status === 'starting' && Date.now() - startedAt > 4000 ? 'no-frames' : status
  return { gameFps: reading?.fps, frameTimeMs: reading?.frameTimeMs, gameFpsStatus: currentStatus, gameFpsPid: targetPid || undefined, gameFpsSource: reading ? 'presentmon' as const : undefined }
}

export function getGameFps(): number { return getGameFpsSnapshot().gameFps || 0 }

export function getGameFpsAccess() {
  return { supported: process.platform === 'win32' && process.arch === 'x64',
    ready: !!broker?.ready || getGameFpsSnapshot().gameFpsStatus === 'ready', pending: !!accessRequest,
    status: getGameFpsSnapshot().gameFpsStatus }
}

export function enableGameFpsAccess(): Promise<FpsAccessResult> {
  if (accessRequest) return accessRequest
  if (broker?.ready) return Promise.resolve({ success: true })
  const helper = findExecutable('FpsBroker.exe')
  if (!getGameFpsAccess().supported || !helper) return Promise.resolve({ success: false, error: 'unavailable' })
  const instance = new FpsAccessBroker((pid, csv) => {
    if (broker === instance && targetPid === pid) samples?.push(csv)
  }, (pid, next) => {
    if (broker !== instance || targetPid !== pid) return
    status = next
    samples = null
  })
  broker?.close()
  broker = instance
  accessRequest = instance.activate(helper).then(result => {
    if (result.success && broker === instance) {
      const pid = targetPid
      stopGameFpsMonitor()
      if (pid) startGameFpsMonitor(pid)
    } else { instance.close(); if (broker === instance) broker = null }
    return result
  }).catch((): FpsAccessResult => {
    instance.close()
    if (broker === instance) broker = null
    return { success: false, error: 'unavailable' }
  }).finally(() => { accessRequest = null })
  return accessRequest
}

export function shutdownGameFpsAccess(): void {
  stopGameFpsMonitor()
  broker?.close()
  broker = null
}
