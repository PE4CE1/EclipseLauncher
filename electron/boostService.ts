import { exec } from 'child_process'
import util from 'util'
import os from 'os'
import { BrowserWindow } from 'electron'

const execAsync = util.promisify(exec)

let originalPowerSchemeGuid: string | null = null
let isBoostActive = false
let boostedPid: number | null = null

/**
 * Real Windows Native Working Set & Memory Optimizer.
 * Flushes unmodified physical working set pages across user-space processes using psapi.dll!EmptyWorkingSet.
 * Reclaims real physical RAM back to the operating system pool.
 */
export async function flushSystemRam(): Promise<{ freedMB: number; currentFreeGB: string }> {
  const ramBefore = os.freemem()

  try {
    // 1. Force V8 engine GC in current Node/Electron main process
    if (global.gc) {
      try { global.gc() } catch {}
    }

    // 2. Real Windows Process Working Set Flush using Win32 EmptyWorkingSet API
    if (process.platform === 'win32') {
      const psScript = `
$code = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class MemoryCleaner {
    [DllImport("psapi.dll")]
    public static extern int EmptyWorkingSet(IntPtr hwProc);

    public static long CleanAll() {
        long freed = 0;
        foreach (Process p in Process.GetProcesses()) {
            try {
                if (p.Id > 4 && p.ProcessName != "csrss" && p.ProcessName != "smss") {
                    long b = p.WorkingSet64;
                    EmptyWorkingSet(p.Handle);
                    p.Refresh();
                    long diff = b - p.WorkingSet64;
                    if (diff > 0) freed += diff;
                }
            } catch {}
        }
        return freed;
    }
}
'@
Add-Type -TypeDefinition $code
$trimmed = [MemoryCleaner]::CleanAll()
Write-Output "TRIMMED:$([math]::Round($trimmed / 1MB))"
`
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
      const cmd = `powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${b64}`
      const { stdout } = await execAsync(cmd, { timeout: 7000, windowsHide: true })
      
      const match = stdout.match(/TRIMMED:(\d+)/)
      const trimmedWorkingSetMB = match ? parseInt(match[1], 10) : 0
      console.log(`[TrueBoost] Native memory clean completed. Trimmed working set: ${trimmedWorkingSetMB} MB`)
    }
  } catch (e) {
    console.warn('[TrueBoost] Native memory clean exception:', e)
  }

  // 3. Measure actual real physical RAM freed
  const ramAfter = os.freemem()
  const diffMB = Math.round((ramAfter - ramBefore) / (1024 * 1024))
  const currentFreeGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1)

  console.log(`[TrueBoost] Physical free RAM before: ${(ramBefore / (1024*1024*1024)).toFixed(2)} GB, after: ${(ramAfter / (1024*1024*1024)).toFixed(2)} GB, diff: ${diffMB} MB`)

  return {
    freedMB: Math.max(0, diffMB),
    currentFreeGB,
  }
}

/**
 * Elevates the game process priority to Above Normal or High for frame pacing consistency.
 */
export async function optimizeGamePriority(pid: number): Promise<boolean> {
  if (process.platform !== 'win32' || pid <= 0) return false
  try {
    // Priority 32768 = Above Normal, 128 = High. Above Normal is the safest for 0 audio/input stutters.
    await execAsync('wmic process where ProcessId=' + pid + ' CALL setpriority 32768', { timeout: 2000, windowsHide: true })
    boostedPid = pid
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
  try {
    const { stdout } = await execAsync('powercfg /getactivescheme', { timeout: 2000, windowsHide: true })
    const match = stdout.match(/GUID:\s*([a-f0-9\-]+)/i)
    if (match && match[1]) {
      originalPowerSchemeGuid = match[1].trim()
    }

    if (originalPowerSchemeGuid && !originalPowerSchemeGuid.includes('8c5e7fda') && !originalPowerSchemeGuid.includes('e9a42b02')) {
      try {
        await execAsync('powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61', { timeout: 1500, windowsHide: true })
        console.log('[TrueBoost] Activated Ultimate Performance power plan')
      } catch {
        await execAsync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', { timeout: 1500, windowsHide: true })
        console.log('[TrueBoost] Activated High Performance power plan')
      }
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
    await execAsync('powercfg /setactive ' + originalPowerSchemeGuid, { timeout: 2000, windowsHide: true })
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
  boostedPid = null

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
