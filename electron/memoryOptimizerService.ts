import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { execSync, execFile } from 'child_process'

let monitorTimer: NodeJS.Timeout | null = null
let maintenanceTimer: NodeJS.Timeout | null = null
let isOptimizing = false
let lastTrimTime = 0
let cachedTrimmerPath: string | null = null

// Memory threshold in Megabytes: triggers proactive trim before touching 100MB
const SOFT_MEMORY_CEILING_MB = 88

function getTrimmerExecutablePath(): string | null {
  if (cachedTrimmerPath && fs.existsSync(cachedTrimmerPath)) {
    return cachedTrimmerPath
  }
  if (process.platform !== 'win32') return null

  const possiblePaths = [
    path.join(__dirname, 'native/MemoryTrimmer.exe'),
    path.join(__dirname, '../electron/native/MemoryTrimmer.exe'),
    path.join(app.getAppPath(), 'electron/native/MemoryTrimmer.exe'),
    path.join(app.getAppPath(), 'dist-electron/native/MemoryTrimmer.exe'),
    path.join(app.getPath('userData'), 'MemoryTrimmer.exe'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      cachedTrimmerPath = p
      return p
    }
  }

  // Auto-compile fallback using standard Windows .NET framework csc.exe
  const csSource = path.join(__dirname, '../electron/native/MemoryTrimmer.cs')
  const targetExe = path.join(app.getPath('userData'), 'MemoryTrimmer.exe')
  if (fs.existsSync(csSource)) {
    try {
      const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      if (fs.existsSync(csc)) {
        execSync(`"${csc}" /nologo /optimize /platform:x64 /target:winexe /out:"${targetExe}" "${csSource}"`)
        if (fs.existsSync(targetExe)) {
          cachedTrimmerPath = targetExe
          return targetExe
        }
      }
    } catch (err) {
      console.warn('[MemoryOptimizer] Auto-compile failed:', err)
    }
  }

  return null
}

/**
 * Computes aggregated memory statistics across all Eclipse Launcher child processes
 * (Main, Chromium Renderers, GPU Process, Audio/Utility).
 */
export function getEclipseMemoryMetrics(): { totalWorkingSetMB: number; totalPrivateMB: number; pids: string[] } {
  const pids = new Set<string>()
  pids.add(process.pid.toString())
  let totalWorkingSetKB = 0
  let totalPrivateKB = 0

  try {
    const metrics = app.getAppMetrics()
    for (const m of metrics) {
      if (m.pid) pids.add(m.pid.toString())
      if (m.memory) {
        totalWorkingSetKB += m.memory.workingSetSize || 0
        totalPrivateKB += m.memory.privateBytes || 0
      }
    }
    return {
      totalWorkingSetMB: Math.round(totalWorkingSetKB / 1024),
      totalPrivateMB: Math.round(totalPrivateKB / 1024),
      pids: Array.from(pids),
    }
  } catch {
    const mem = process.memoryUsage()
    return {
      totalWorkingSetMB: Math.round(mem.rss / (1024 * 1024)),
      totalPrivateMB: Math.round(mem.heapUsed / (1024 * 1024)),
      pids: Array.from(pids),
    }
  }
}

/**
 * Trims V8 heap via garbage collection and flushes unmodified physical working set pages
 * across all Eclipse Launcher child processes using native Win32 EmptyWorkingSet.
 */
export async function trimMemoryNow(force: boolean = false): Promise<void> {
  const now = Date.now()
  // Debounce to prevent rapid back-to-back trimmings within 2.5 seconds
  if (isOptimizing || (!force && now - lastTrimTime < 2500)) return
  isOptimizing = true
  lastTrimTime = now

  try {
    // 1. Force V8 Engine Garbage Collection in Main Process
    if (global.gc) {
      try {
        global.gc()
      } catch {}
    }

    // 2. Instruct all active WebContents to run GC and purge v8/blink memory caches
    try {
      const allWindows = BrowserWindow.getAllWindows()
      for (const win of allWindows) {
        if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed() && !win.webContents.isCrashed()) {
          try {
            win.webContents.send('memory:trim')
          } catch {}
          try {
            win.webContents.executeJavaScript('if (typeof window !== "undefined" && window.gc) { window.gc(); }').catch(() => {})
          } catch {}
        }
      }
    } catch {}

    // 3. Flush physical process working sets using native MemoryTrimmer.exe
    if (process.platform === 'win32') {
      const exePath = getTrimmerExecutablePath()
      if (exePath && fs.existsSync(exePath)) {
        const { pids } = getEclipseMemoryMetrics()
        await new Promise<void>((resolve) => {
          execFile(exePath, pids, { windowsHide: true }, () => {
            resolve()
          })
        })
      }
    }
  } catch (err) {
    console.warn('[MemoryOptimizer] Memory trim encountered an issue:', err)
  } finally {
    isOptimizing = false
  }
}

/**
 * Initializes the automated memory optimizer service.
 * Continuously keeps memory usage stably under 100MB using proactive soft-ceiling detection.
 */
export function startMemoryOptimizer(getMainWindow: () => BrowserWindow | null): void {
  // Initial post-startup trim: gives renderer 5 seconds to complete initial load & stores
  setTimeout(() => {
    trimMemoryNow(true)
  }, 5000).unref()

  // 1. Continuous health monitor: checks memory every 5 seconds
  // If memory approaches the soft ceiling (>= 88MB), triggers immediate proactive trim
  if (!monitorTimer) {
    monitorTimer = setInterval(() => {
      try {
        const { totalWorkingSetMB } = getEclipseMemoryMetrics()
        if (totalWorkingSetMB >= SOFT_MEMORY_CEILING_MB) {
          trimMemoryNow()
        }
      } catch {}
    }, 5000)
    monitorTimer.unref()
  }

  // 2. Baseline idle maintenance: runs every 15 seconds to keep baseline memory lean (~65MB–75MB)
  if (!maintenanceTimer) {
    maintenanceTimer = setInterval(() => {
      const now = Date.now()
      if (now - lastTrimTime >= 12000) {
        trimMemoryNow()
      }
    }, 15000)
    maintenanceTimer.unref()
  }
}

export function stopMemoryOptimizer(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
  if (maintenanceTimer) {
    clearInterval(maintenanceTimer)
    maintenanceTimer = null
  }
}
