import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFileSync, execFile } from 'child_process'
import { memoryReliefDue, normalizeMemoryTarget, DEFAULT_MEMORY_TARGET_MB } from '../src/services/memoryBudget'
import type { MemoryBudgetStatus } from '../src/types/system'

let monitorTimer: NodeJS.Timeout | null = null
let isOptimizing = false
let lastTrimTime = 0
let cachedTrimmerPath: string | null = null

let getMemoryTarget = () => DEFAULT_MEMORY_TARGET_MB
let lastReliefAt: number | null = null

export async function getMemoryBudgetStatus(): Promise<MemoryBudgetStatus> {
  const metrics = getEclipseMemoryMetrics(), targetMB = normalizeMemoryTarget(getMemoryTarget())
  return { targetMB, workingSetMB: metrics.totalWorkingSetMB, privateMB: metrics.totalPrivateMB,
    residentMB: null, committedMB: metrics.totalPrivateMB, measurement: 'working-set-estimate',
    pressure: targetMB > 0 && metrics.totalWorkingSetMB > targetMB, lastReliefAt }
}

function getTrimmerExecutablePath(): string | null {
  if (cachedTrimmerPath && fs.existsSync(cachedTrimmerPath)) {
    return cachedTrimmerPath
  }
  if (process.platform !== 'win32') return null

  const possiblePaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'native', 'MemoryTrimmer.exe'),
    path.join(__dirname, 'native/MemoryTrimmer.exe'),
    path.join(__dirname, '../electron/native/MemoryTrimmer.exe'),
    path.join(app.getAppPath(), 'electron/native/MemoryTrimmer.exe'),
    path.join(app.getAppPath(), 'dist-electron/native/MemoryTrimmer.exe'),
    path.join(app.getPath('userData'), 'MemoryTrimmer.exe'),
  ]

  for (const p of possiblePaths) {
    if (!/(^|[\\/])app\.asar([\\/]|$)/i.test(p) && fs.existsSync(p)) {
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
        const physicalSource = /(^|[\\/])app\.asar([\\/]|$)/i.test(csSource)
          ? path.join(app.getPath('userData'), 'MemoryTrimmer.cs') : csSource
        if (physicalSource !== csSource) fs.writeFileSync(physicalSource, fs.readFileSync(csSource))
        execFileSync(csc, ['/nologo', '/optimize', '/platform:x64', '/target:winexe', `/out:${targetExe}`, physicalSource], { windowsHide: true, timeout: 15000 })
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
    const measured = new Set<number>()
    for (const m of metrics) {
      if (!m.pid || measured.has(m.pid)) continue
      measured.add(m.pid)
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
      totalPrivateMB: 0,
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
          execFile(exePath, pids, { windowsHide: true, timeout: 5000 }, () => {
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

let sampling = false
export async function requestMemoryRelief(force = false): Promise<void> {
  if (sampling) return
  sampling = true
  try {
    const targetMB = normalizeMemoryTarget(getMemoryTarget())
    if (!targetMB && !force) return
    const status = await getMemoryBudgetStatus(), usage = status.residentMB ?? status.workingSetMB, now = Date.now()
    if (!force && !memoryReliefDue(usage, targetMB, now, lastReliefAt)) return
    lastReliefAt = now
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isCrashed()) continue
      window.webContents.send('memory:pressure', { targetMB, workingSetMB: usage })
    }
  } catch {} finally { sampling = false }
}

/** Reclaim unused data before the target is reached; paging active working sets causes restore stalls. */
export function startMemoryOptimizer(_getMainWindow: () => BrowserWindow | null, target: () => number = () => DEFAULT_MEMORY_TARGET_MB): void {
  getMemoryTarget = target
  if (!monitorTimer) {
    monitorTimer = setInterval(requestMemoryRelief, 15000)
    monitorTimer.unref()
  }
}

export function stopMemoryOptimizer(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
  lastReliefAt = null
}
