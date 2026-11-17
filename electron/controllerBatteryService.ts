/**
 * controllerBatteryService.ts
 *
 * Reads exact controller battery and model information using native Win32/XInput/HID APIs.
 */

import { execFile, execFileSync } from 'child_process'
import { app } from 'electron'
import { ipcMain } from './ipcSecurity'
import path from 'path'
import fs from 'fs'

export interface ControllerBatteryResult {
  connected: boolean
  model: string
  vendor: 'sony' | 'xbox' | 'nintendo' | 'unknown'
  connectionType: 'bluetooth' | 'usb' | 'wireless' | 'none'
  level: number
  charging: boolean
  hasExactLevel: boolean
  slot?: number
}

let cachedResult: ControllerBatteryResult | null = null
let lastQueryTime = 0
const CACHE_TTL_MS = 2500
let pendingQuery: Promise<ControllerBatteryResult> | null = null

function getExecutablePath(): string {
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'native', 'ControllerBatteryReader.exe'),
    path.join(__dirname, 'native/ControllerBatteryReader.exe'),
    path.join(__dirname, '../electron/native/ControllerBatteryReader.exe'),
    path.join(process.cwd(), 'electron/native/ControllerBatteryReader.exe'),
    path.join(process.cwd(), 'dist-electron/native/ControllerBatteryReader.exe'),
    path.join(app.getAppPath(), 'electron/native/ControllerBatteryReader.exe'),
    path.join(app.getAppPath(), 'dist-electron/native/ControllerBatteryReader.exe'),
    path.join(app.getPath('userData'), 'ControllerBatteryReader.exe'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }

  // Auto-compile if not found
  const csSource = path.join(__dirname, '../electron/native/ControllerBatteryReader.cs')
  const targetExe = path.join(app.getPath('userData'), 'ControllerBatteryReader.exe')
  if (fs.existsSync(csSource)) {
    try {
      const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      if (fs.existsSync(csc)) {
        execFileSync(csc, ['/nologo', `/out:${targetExe}`, csSource], { windowsHide: true, timeout: 15000 })
        if (fs.existsSync(targetExe)) return targetExe
      }
    } catch (err) {
      console.warn('[ControllerBattery] Failed to compile ControllerBatteryReader.cs:', err)
    }
  }

  return possiblePaths[0]
}

let lastStableResult: ControllerBatteryResult | null = null
let pendingCandidateLevel: { level: number; count: number } | null = null

export function queryControllerBattery(): Promise<ControllerBatteryResult> {
  const now = Date.now()
  const ttl = cachedResult?.connected ? 2500 : 5000
  if (cachedResult && (now - lastQueryTime) < ttl) {
    return Promise.resolve(cachedResult)
  }

  if (pendingQuery) return pendingQuery
  const query = new Promise<ControllerBatteryResult>((resolve) => {
    const exePath = getExecutablePath()
    if (!fs.existsSync(exePath)) {
      const fallback: ControllerBatteryResult = {
        connected: false,
        model: '',
        vendor: 'unknown',
        connectionType: 'none',
        level: 0,
        charging: false,
        hasExactLevel: false,
      }
      cachedResult = fallback
      lastQueryTime = Date.now()
      return resolve(fallback)
    }

    execFile(exePath, [], { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(cachedResult || {
          connected: false,
          model: '',
          vendor: 'unknown',
          connectionType: 'none',
          level: 0,
          charging: false,
          hasExactLevel: false,
        })
      }

      try {
        const raw = JSON.parse(stdout.trim()) as ControllerBatteryResult
        if (!raw || typeof raw.connected !== 'boolean' || !Number.isFinite(raw.level)) throw new Error('Invalid controller battery reading')
        
        if (!raw.connected) {
          lastStableResult = null
          pendingCandidateLevel = null
          cachedResult = raw
          lastQueryTime = Date.now()
          return resolve(raw)
        }

        // Apply hysteresis & smoothing
        let smoothedLevel = raw.level
        if (lastStableResult && lastStableResult.connected && lastStableResult.model === raw.model) {
          const wasCharging = lastStableResult.charging
          const isCharging = raw.charging

          // If charging state changed, accept new reading directly
          if (wasCharging !== isCharging) {
            smoothedLevel = raw.level
            pendingCandidateLevel = null
          } else if (!isCharging) {
            // While discharging, battery level should naturally only decrease or stay equal.
            // If raw reading suddenly jumps up (e.g. 50% -> 80%), require 3 consecutive readings before accepting.
            if (raw.level > lastStableResult.level) {
              if (pendingCandidateLevel && pendingCandidateLevel.level === raw.level) {
                pendingCandidateLevel.count++
                if (pendingCandidateLevel.count >= 3) {
                  smoothedLevel = raw.level
                  pendingCandidateLevel = null
                } else {
                  smoothedLevel = lastStableResult.level
                }
              } else {
                pendingCandidateLevel = { level: raw.level, count: 1 }
                smoothedLevel = lastStableResult.level
              }
            } else {
              pendingCandidateLevel = null
              smoothedLevel = raw.level
            }
          } else {
            // While charging, battery level should not drop suddenly
            if (raw.level < lastStableResult.level) {
              if (pendingCandidateLevel && pendingCandidateLevel.level === raw.level) {
                pendingCandidateLevel.count++
                if (pendingCandidateLevel.count >= 3) {
                  smoothedLevel = raw.level
                  pendingCandidateLevel = null
                } else {
                  smoothedLevel = lastStableResult.level
                }
              } else {
                pendingCandidateLevel = { level: raw.level, count: 1 }
                smoothedLevel = lastStableResult.level
              }
            } else {
              pendingCandidateLevel = null
              smoothedLevel = raw.level
            }
          }
        }

        const filteredResult: ControllerBatteryResult = {
          ...raw,
          level: Math.max(0, Math.min(100, smoothedLevel)),
        }

        lastStableResult = filteredResult
        cachedResult = filteredResult
        lastQueryTime = Date.now()
        resolve(filteredResult)
      } catch {
        resolve({
          connected: false,
          model: '',
          vendor: 'unknown',
          connectionType: 'none',
          level: 0,
          charging: false,
          hasExactLevel: false,
        })
      }
    })
  })
  pendingQuery = query.finally(() => { pendingQuery = null })
  return pendingQuery
}

export function triggerControllerVibration(): Promise<boolean> {
  return new Promise((resolve) => {
    const exePath = getExecutablePath()
    if (!fs.existsSync(exePath)) return resolve(false)
    execFile(exePath, ['--vibrate'], { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(false)
      try {
        const res = JSON.parse(stdout.trim())
        resolve(Boolean(res.success))
      } catch {
        resolve(false)
      }
    })
  })
}

export function initControllerBatteryService() {
  ipcMain.handle('controller:get-battery', async () => {
    return await queryControllerBattery()
  })
  ipcMain.handle('controller:vibrate', async () => {
    return await triggerControllerVibration()
  })
}
