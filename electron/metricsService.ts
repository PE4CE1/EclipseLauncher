import os from 'os'
import { BrowserWindow, powerMonitor } from 'electron'

let prevCpus = os.cpus()
let metricsInterval: NodeJS.Timeout | null = null

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

export function startMetricsService(getOverlayWindow: () => BrowserWindow | null) {
  if (metricsInterval) return

  metricsInterval = setInterval(() => {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) return

    const cpu = getCpuPercent()
    const ram = getRamInfo()
    const idleTime = powerMonitor.getSystemIdleTime() // in seconds

    // We send gpu: 0 because WMI queries for GPU cause system-wide micro-stutters
    win.webContents.send('metrics:update', {
      cpu,
      gpu: 0,
      ram: ram.percent,
      ramMB: ram.usedMB,
      totalMB: ram.totalMB,
      idleTime,
    })
  }, 1000)
}

export function stopMetricsService() {
  if (metricsInterval) {
    clearInterval(metricsInterval)
    metricsInterval = null
  }
}
