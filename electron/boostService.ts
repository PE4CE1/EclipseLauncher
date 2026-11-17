import { execFile } from 'child_process'
import util from 'util'
import os from 'os'
import { BrowserWindow } from 'electron'
import { getEclipseMemoryMetrics, trimMemoryNow } from './memoryOptimizerService'

const execFileAsync = util.promisify(execFile)

let originalPowerSchemeGuid: string | null = null
let isBoostActive = false
let boostedProcess: { pid: number; originalPriority: number } | null = null

/** Trim only the launcher's working sets; other applications retain their useful pages. */
export async function flushSystemRam(): Promise<{ freedMB: number; currentFreeGB: string }> {
  const before = getEclipseMemoryMetrics().totalWorkingSetMB
  await trimMemoryNow(true)
  const after = getEclipseMemoryMetrics().totalWorkingSetMB
  return {
    freedMB: Math.max(0, before - after),
    currentFreeGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1),
  }
}

/**
 * Elevates the game process priority to Above Normal or High for frame pacing consistency.
 */
export async function optimizeGamePriority(pid: number): Promise<boolean> {
  if (process.platform !== 'win32' || !Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffffffff) return false
  try {
    const originalPriority = os.getPriority(pid)
    os.setPriority(pid, os.constants.priority.PRIORITY_ABOVE_NORMAL)
    if (!boostedProcess || boostedProcess.pid !== pid) boostedProcess = { pid, originalPriority }
    console.log('[TrueBoost] Elevated game PID ' + pid + ' priority to AboveNormal')
    return true
  } catch (e) {
    console.warn('[TrueBoost] Could not set game priority:', e)
    return false
  }
}

/**
 * Temporarily activates Windows Ultimate/High Performance power plan.
 */
export async function activateGamingPowerPlan(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  if (originalPowerSchemeGuid) return true
  try {
    const { stdout } = await execFileAsync('powercfg.exe', ['/getactivescheme'], { timeout: 2000, windowsHide: true })
    const match = stdout.match(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/i)
    if (!match) return false
    const previousScheme = match[0].toLowerCase()

    if (previousScheme !== '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' && previousScheme !== 'e9a42b02-d5df-448d-aa00-03f14749eb61') {
      try {
        await execFileAsync('powercfg.exe', ['/setactive', 'e9a42b02-d5df-448d-aa00-03f14749eb61'], { timeout: 1500, windowsHide: true })
        console.log('[TrueBoost] Activated Ultimate Performance power plan')
      } catch {
        await execFileAsync('powercfg.exe', ['/setactive', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'], { timeout: 1500, windowsHide: true })
        console.log('[TrueBoost] Activated High Performance power plan')
      }
      originalPowerSchemeGuid = previousScheme
    }
    return true
  } catch (e) {
    return false
  }
}

/**
 * Restores the user's previous power scheme.
 */
export async function restorePowerPlan(): Promise<void> {
  if (process.platform !== 'win32' || !originalPowerSchemeGuid) return
  try {
    await execFileAsync('powercfg.exe', ['/setactive', originalPowerSchemeGuid], { timeout: 2000, windowsHide: true })
    console.log('[TrueBoost] Restored previous power plan (' + originalPowerSchemeGuid + ')')
    originalPowerSchemeGuid = null
  } catch (e) {
    console.warn('[TrueBoost] Failed to restore power plan:', e)
  }
}

/**
 * Triggers full True Boost suite when a game starts.
 */
export async function enableTrueBoostForGame(
  gameName: string,
  pid: number,
  settings: any,
  mainWindow: BrowserWindow | null
): Promise<{ freedMB: number; success: boolean }> {
  if (isBoostActive) return { freedMB: 0, success: true }
  isBoostActive = true

  console.log('[TrueBoost] Activating True Boost for: ' + gameName + ' (PID: ' + pid + ')')

  let freed = 0
  try {
    if (settings.trueBoostRamClean !== false) {
      const res = await flushSystemRam()
      freed = res.freedMB
    }

    if (settings.trueBoostPowerPlan !== false) {
      await activateGamingPowerPlan()
    }

    if (settings.trueBoostGamePriority !== false && pid > 0) {
      await optimizeGamePriority(pid)
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('boost:status', {
        active: true,
        gameName,
        freedMB: freed,
        timestamp: Date.now()
      })
    }
  } catch (e) {
    console.error('[TrueBoost] Error during activation:', e)
  }

  return { freedMB: freed, success: true }
}

/**
 * Disables True Boost and cleans up when the game stops.
 */
export async function disableTrueBoost(mainWindow: BrowserWindow | null): Promise<void> {
  if (!isBoostActive) return
  isBoostActive = false
  if (boostedProcess) {
    try { os.setPriority(boostedProcess.pid, boostedProcess.originalPriority) } catch {}
    boostedProcess = null
  }

  console.log('[TrueBoost] Deactivating True Boost and restoring system settings')
  try {
    await restorePowerPlan()
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('boost:status', {
        active: false,
        timestamp: Date.now()
      })
    }
  } catch (e) {
    console.error('[TrueBoost] Error during deactivation:', e)
  }
}
