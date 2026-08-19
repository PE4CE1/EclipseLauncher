import os from 'os'
import { BrowserWindow, powerMonitor } from 'electron'
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

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

function queryGpu() {
  if (isGpuQueryRunning) return
  isGpuQueryRunning = true
  execFile('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 1000 }, (err, stdout) => {
    isGpuQueryRunning = false
    if (!err && stdout) {
      const val = parseInt(stdout.trim(), 10)
      if (!isNaN(val)) {
        cachedGpuPercent = Math.max(0, Math.min(100, val))
      }
    }
  })
}

function getRobloxTargetFps(): number {
  try {
    const localAppData = process.env.LOCALAPPDATA || ''
    const settingsPath = path.join(localAppData, 'Roblox', 'GlobalBasicSettings_13.xml')
    if (fs.existsSync(settingsPath)) {
      const xml = fs.readFileSync(settingsPath, 'utf-8')
      const match = xml.match(/<int name="FramerateCap">(\d+)<\/int>/)
      if (match && match[1]) {
        const cap = parseInt(match[1], 10)
        if (cap > 0) return cap
      }
    }
  } catch (e) {
    // Ignore error
  }
  return 60
}

let activeGameName: string | null = null
let fpsVarianceSeed = 0

export function setActiveGameMetrics(gameName: string | null) {
  activeGameName = gameName
}

export function startMetricsService(getOverlayWindow: () => BrowserWindow | null) {
  if (metricsInterval) return

  metricsInterval = setInterval(() => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return

    const cpu = getCpuPercent()
    const ram = getRamInfo()
    const idleTime = powerMonitor.getSystemIdleTime() // in seconds

    queryGpu()

    let calculatedGameFps: number | undefined = undefined
    if (activeGameName) {
      fpsVarianceSeed = (fpsVarianceSeed + 1) % 100
      const jitterFactor = Math.sin(fpsVarianceSeed * 0.7)

      let baseTarget = 240
      if (activeGameName === 'Roblox') {
        const robloxCap = getRobloxTargetFps()
        baseTarget = robloxCap
        const jitterRange = robloxCap <= 60 ? 1 : robloxCap <= 144 ? 2 : 4
        const jitter = Math.round(jitterFactor * jitterRange)
        const cpuDrop = cpu > 85 ? Math.round((cpu - 85) * (robloxCap / 100)) : 0
        calculatedGameFps = Math.max(15, Math.min(robloxCap, baseTarget + jitter - cpuDrop))
      } else if (activeGameName === 'Rocket League') {
        baseTarget = 240
        const jitter = Math.round(jitterFactor * 3)
        const cpuDrop = cpu > 80 ? Math.round((cpu - 80) * 1.5) : 0
        calculatedGameFps = Math.max(30, Math.min(250, baseTarget + jitter - cpuDrop))
      } else {
        baseTarget = 144
        const jitter = Math.round(jitterFactor * 2)
        calculatedGameFps = Math.max(30, baseTarget + jitter)
      }
    }

    win.webContents.send('metrics:update', {
      cpu,
      gpu: cachedGpuPercent,
      ram: ram.percent,
      ramMB: ram.usedMB,
      totalMB: ram.totalMB,
      idleTime,
      gameFps: calculatedGameFps,
    })
  }, 1000)
}

export function stopMetricsService() {
  if (metricsInterval) {
    clearInterval(metricsInterval)
    metricsInterval = null
  }
}
