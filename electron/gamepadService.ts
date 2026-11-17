import { ipcMain } from './ipcSecurity'
/**
 * gamepadService.ts
 *
 * Runs the native high-speed XInputReader.exe background service.
 * Because XInputGetState is called via native Win32 DLL, it reads controller
 * input in real-time (100Hz) even when Rocket League, Roblox, or any other game has OS focus.
 */

import { spawn, ChildProcess, execFileSync } from 'child_process'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'

let xinputProc: ChildProcess | null = null
let isRunning = false
let ipcRegistered = false
let restartTimer: NodeJS.Timeout | null = null
const consumers = new Set<string>()
const trackedRenderers = new WeakSet<Electron.WebContents>()

export function initGamepadIPC() {
  if (ipcRegistered) return
  ipcRegistered = true
  ipcMain.handle('gamepad:start-service', event => {
    const owner = `renderer:${event.sender.id}`
    if (!trackedRenderers.has(event.sender)) {
      trackedRenderers.add(event.sender)
      event.sender.once('destroyed', () => releaseGamepadService(owner))
      event.sender.on('render-process-gone', () => releaseGamepadService(owner))
      event.sender.on('did-start-navigation', details => {
        if (details.isMainFrame && !details.isSameDocument) releaseGamepadService(owner)
      })
    }
    acquireGamepadService(owner)
    return true
  })
  ipcMain.handle('gamepad:stop-service', event => {
    releaseGamepadService(`renderer:${event.sender.id}`)
    return true
  })
}

export function acquireGamepadService(owner: string, getOverlay?: () => BrowserWindow | null) {
  consumers.add(owner)
  startGamepadService(getOverlay)
}

export function releaseGamepadService(owner: string) {
  consumers.delete(owner)
  if (consumers.size === 0) stopGamepadService()
}

// ─── XInput button bitmask constants ─────────────────────────────────────────
const BTN = {
  DPAD_UP:        0x0001,
  DPAD_DOWN:      0x0002,
  DPAD_LEFT:      0x0004,
  DPAD_RIGHT:     0x0008,
  START:          0x0010,
  BACK:           0x0020,
  LEFT_THUMB:     0x0040,
  RIGHT_THUMB:    0x0080,
  LEFT_SHOULDER:  0x0100,
  RIGHT_SHOULDER: 0x0200,
  A:              0x1000,
  B:              0x2000,
  X:              0x4000,
  Y:              0x8000,
}

// ─── Convert raw XInput state → standard Gamepad API format ──────────────────
function xInputToGamepadAPI(raw: any) {
  const bitmask: number = raw.b || 0
  const lt: number = raw.lt || 0   // 0-255
  const rt: number = raw.rt || 0   // 0-255
  const lx: number = raw.lx || 0   // -32768..32767
  const ly: number = raw.ly || 0
  const rx: number = raw.rx || 0
  const ry: number = raw.ry || 0

  const bit = (mask: number) => {
    const pressed = (bitmask & mask) !== 0
    return { pressed, value: pressed ? 1.0 : 0.0 }
  }

  const isBack = ((bitmask & BTN.BACK) !== 0) || ((bitmask & 0x0800) !== 0)
  const buttons = [
    bit(BTN.A),              // 0  – A / Cross
    bit(BTN.B),              // 1  – B / Circle
    bit(BTN.X),              // 2  – X / Square
    bit(BTN.Y),              // 3  – Y / Triangle
    bit(BTN.LEFT_SHOULDER),  // 4  – LB / L1
    bit(BTN.RIGHT_SHOULDER), // 5  – RB / R1
    { pressed: lt > 20, value: lt / 255 },  // 6  – LT / L2 (analog)
    { pressed: rt > 20, value: rt / 255 },  // 7  – RT / R2 (analog)
    { pressed: isBack, value: isBack ? 1.0 : 0.0 }, // 8  – Back / Select / Share / Touchpad
    bit(BTN.START),          // 9  – Start / Options
    bit(BTN.LEFT_THUMB),     // 10 – L3
    bit(BTN.RIGHT_THUMB),    // 11 – R3
    bit(BTN.DPAD_UP),        // 12 – D-Pad Up
    bit(BTN.DPAD_DOWN),      // 13 – D-Pad Down
    bit(BTN.DPAD_LEFT),      // 14 – D-Pad Left
    bit(BTN.DPAD_RIGHT),     // 15 – D-Pad Right
    bit(0x0400),             // 16 – Guide / PS button
    bit(0x0800),             // 17 – Touchpad click
  ]

  // Gamepad API axes: -1..1, LY & RY are inverted per spec
  const axes = [
    Math.max(-1, Math.min(1, lx / 32767)),
    Math.max(-1, Math.min(1, -ly / 32767)),
    Math.max(-1, Math.min(1, rx / 32767)),
    Math.max(-1, Math.min(1, -ry / 32767)),
  ]

  return { buttons, axes, connected: true }
}

function getExecutablePath(): string {
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'native', 'XInputReader.exe'),
    path.join(__dirname, 'native/XInputReader.exe'),
    path.join(__dirname, '../electron/native/XInputReader.exe'),
    path.join(process.cwd(), 'electron/native/XInputReader.exe'),
    path.join(process.cwd(), 'dist-electron/native/XInputReader.exe'),
    path.join(app.getAppPath(), 'electron/native/XInputReader.exe'),
    path.join(app.getAppPath(), 'dist-electron/native/XInputReader.exe'),
    path.join(app.getPath('userData'), 'XInputReader.exe'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }

  // Compile if not found
  const csSource = path.join(__dirname, '../electron/native/XInputReader.cs')
  const targetExe = path.join(app.getPath('userData'), 'XInputReader.exe')
  if (fs.existsSync(csSource)) {
    try {
      const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      execFileSync(csc, ['/nologo', '/optimize', '/target:exe', `/out:${targetExe}`, csSource], { windowsHide: true, timeout: 15000 })
      if (fs.existsSync(targetExe)) return targetExe
    } catch (err) {
      console.warn('[GamepadService] Failed to auto-compile XInputReader:', err)
    }
  }

  return possiblePaths[0]
}

export function startGamepadService(getOverlay?: () => BrowserWindow | null) {
  initGamepadIPC()
  if (isRunning && xinputProc) return
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  isRunning = true

  const exePath = getExecutablePath()
  if (!fs.existsSync(exePath)) {
    isRunning = false
    console.warn('[GamepadService] XInputReader.exe not found at:', exePath)
    return
  }

  try {
    xinputProc = spawn(exePath, [], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (err) {
    isRunning = false
    console.error('[GamepadService] Failed to spawn XInputReader:', err)
    return
  }

  let lineBuffer = ''
  const child = xinputProc

  xinputProc.stdout?.on('data', (chunk: Buffer) => {
    if (child !== xinputProc || !isRunning) return
    lineBuffer += chunk.toString('utf8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    if (lineBuffer.length > 65536) lineBuffer = ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = JSON.parse(trimmed)
        const state = !raw.c ? { connected: false, buttons: [], axes: [0, 0, 0, 0] } : xInputToGamepadAPI(raw)

        const allWins = BrowserWindow.getAllWindows()
        for (const win of allWins) {
          if (win && !win.isDestroyed() && win.isVisible() && !win.webContents.isDestroyed()) {
            win.webContents.send('overlay:gamepad-state', state)
          }
        }
      } catch {}
    }
  })

  const handleClose = () => {
    if (child !== xinputProc) return
    xinputProc = null
    if (isRunning) {
      restartTimer = setTimeout(() => {
        restartTimer = null
        if (isRunning) startGamepadService(getOverlay)
      }, 1000)
      restartTimer.unref()
    }
  }
  child.on('error', (err) => {
    console.warn('[GamepadService] XInputReader process error:', err)
    handleClose()
  })
  child.on('exit', handleClose)

  console.log('[GamepadService] Native XInputReader service started successfully.')
}

export function stopGamepadService() {
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (!isRunning && !xinputProc) return
  isRunning = false
  consumers.clear()
  if (xinputProc) {
    try {
      xinputProc.kill()
    } catch {}
    xinputProc = null
  }
  console.log('[GamepadService] Native XInputReader stopped.')
}
