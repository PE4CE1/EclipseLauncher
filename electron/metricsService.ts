import os from 'os'
import { BrowserWindow, powerMonitor } from 'electron'
import { execFile } from 'child_process'
import { getGameFps } from './gameFpsService'

let prevCpus = os.cpus()
let metricsInterval: NodeJS.Timeout | null = null
let cachedGpuPercent = 0
let isGpuQueryRunning = false

function getCpuPercent(): number {
  const cpus = os.cpus()
  let totalDiff = 0
  let idleDiff = 0

  for (let i = 0; i < cpus.length; i++) {
    const prev = prevCpus[i].times
    const curr = cpus[i].times
    const prevTotal = Object.values(prev).reduce((a, b) => a + b, 0)
    const currTotal = Object.values(curr).reduce((a, b) => a + b, 0)
    totalDiff += currTotal - prevTotal
    idleDiff += curr.idle - prev.idle
  }

  prevCpus = cpus
  if (totalDiff === 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100)))
}

function getRamInfo() {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  return {
    percent: Math.round((used / total) * 100),
    usedMB: Math.round(used / 1024 / 1024),
    totalMB: Math.round(total / 1024 / 1024),
  }
}

let lastGpuQueryTime = 0

function queryGpu() {
  const now = Date.now()
  if (isGpuQueryRunning || now - lastGpuQueryTime < 3000) return
  isGpuQueryRunning = true
  lastGpuQueryTime = now
  execFile('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 800, windowsHide: true }, (err, stdout) => {
    isGpuQueryRunning = false
    if (!err && stdout) {
      const val = parseInt(stdout.trim(), 10)
      if (!isNaN(val)) {
        cachedGpuPercent = Math.max(0, Math.min(100, val))
      }
    }
  })
}

let activeGameName: string | null = null

export function setActiveGameMetrics(gameName: string | null) {
  activeGameName = gameName
}

export function startMetricsService(getOverlayWindow: () => BrowserWindow | null) {
  if (metricsInterval) return

  metricsInterval = setInterval(() => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) return

    const cpu = getCpuPercent()
    const ram = getRamInfo()
    const idleTime = powerMonitor.getSystemIdleTime() // in seconds

    queryGpu()

    // Real FPS from DWM composition timing (external, safe, no injection)
    const gameFps = activeGameName ? (getGameFps() || undefined) : undefined

    win.webContents.send('metrics:update', {
      cpu,
      gpu: cachedGpuPercent,
      ram: ram.percent,
      ramMB: ram.usedMB,
      totalMB: ram.totalMB,
      idleTime,
      gameFps,
    })
  }, 1000)
}

export function stopMetricsService() {
  if (metricsInterval) {
    clearInterval(metricsInterval)
    metricsInterval = null
  }
}
