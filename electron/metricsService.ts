import os from 'os'
import { BrowserWindow, powerMonitor } from 'electron'
import { startGameFpsMonitor, stopGameFpsMonitor, getGameFpsSnapshot } from './gameFpsService'
import { GpuMetricsReader } from './gpuMetricsReader'

export interface MetricsOptions { pid?: number; fps?: boolean; cpu?: boolean; gpu?: boolean; ram?: boolean; idle?: boolean }
let options: MetricsOptions = {}
let prevCpus: os.CpuInfo[] = []
let timer: NodeJS.Timeout | null = null
let getWindow: (() => BrowserWindow | null) | null = null
const gpuReader = new GpuMetricsReader()
let activeFpsPid = 0
let lastPayload = ''

function cpuPercent(): number {
  const cpus = os.cpus()
  let total = 0, idle = 0
  if (cpus.length === prevCpus.length) cpus.forEach((cpu, index) => {
    total += Object.values(cpu.times).reduce((a, b) => a + b, 0) - Object.values(prevCpus[index].times).reduce((a, b) => a + b, 0)
    idle += cpu.times.idle - prevCpus[index].times.idle
  })
  prevCpus = cpus
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0
}

function publish(): void {
  const win = getWindow?.()
  if (!win || win.isDestroyed() || !win.isVisible() || win.webContents.isLoadingMainFrame()) return
  const totalMB = options.ram ? Math.round(os.totalmem() / 1048576) : undefined
  const ramMB = options.ram ? Math.round((os.totalmem() - os.freemem()) / 1048576) : undefined
  const fps = getGameFpsSnapshot()
  const payload = {
    cpu: options.cpu ? cpuPercent() : undefined,
    gpu: options.gpu ? gpuReader.read() : undefined,
    ram: totalMB && ramMB !== undefined ? Math.round(ramMB / totalMB * 100) : undefined,
    ramMB, totalMB,
    idleTime: options.idle ? powerMonitor.getSystemIdleTime() : 0,
    ...fps,
  }
  const serialized = JSON.stringify(payload)
  if (serialized !== lastPayload) { lastPayload = serialized; win.webContents.send('metrics:update', payload) }
}

export function startMetricsService(getOverlayWindow: () => BrowserWindow | null, selection: MetricsOptions = { cpu: true, gpu: true, ram: true, idle: true }): void {
  getWindow = getOverlayWindow
  const nextPid = selection.fps && Number.isSafeInteger(selection.pid) && selection.pid! > 0 ? selection.pid! : 0
  const next: MetricsOptions = {pid:nextPid,fps:!!selection.fps,cpu:!!selection.cpu,gpu:!!selection.gpu,ram:!!selection.ram,idle:!!selection.idle}
  if ((Object.keys(next) as Array<keyof MetricsOptions>).every(key => options[key] === next[key])) return
  if (nextPid !== activeFpsPid) {
    activeFpsPid = nextPid
    if (nextPid) startGameFpsMonitor(nextPid)
    else stopGameFpsMonitor()
  }
  if (selection.cpu && !options.cpu) prevCpus = os.cpus()
  if (!selection.gpu) gpuReader.stop()
  options = next
  const needsPolling = selection.cpu || selection.gpu || selection.ram || selection.idle || nextPid > 0
  if (!needsPolling && timer) { clearInterval(timer); timer = null }
  if (needsPolling && !timer) {
    lastPayload = ''
    timer = setInterval(publish, 1000)
  }
  publish()
}

export function stopMetricsService(): void {
  if (timer) clearInterval(timer)
  timer = null
  getWindow = null
  gpuReader.stop()
  options = {}
  activeFpsPid = 0
  lastPayload = ''
  stopGameFpsMonitor()
}
