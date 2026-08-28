/**
 * gamepadService.ts
 *
 * Runs the native high-speed XInputReader.exe background service.
 * Because XInputGetState is called via native Win32 DLL, it reads controller
 * input in real-time (100Hz) even when Rocket League, Roblox, or any other game has OS focus.
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'

let xinputProc: ChildProcess | null = null
let overlayWinRef: (() => BrowserWindow | null) | null = null
let isRunning = false

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

  // Standard Gamepad API button layout (0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 8=Back, 9=Start, 10=L3, 11=R3, 12=Up, 13=Down, 14=Left, 15=Right)
  const buttons = [
    bit(BTN.A),              // 0  – A / Cross
    bit(BTN.B),              // 1  – B / Circle
    bit(BTN.X),              // 2  – X / Square
    bit(BTN.Y),              // 3  – Y / Triangle
    bit(BTN.LEFT_SHOULDER),  // 4  – LB / L1
    bit(BTN.RIGHT_SHOULDER), // 5  – RB / R1
    { pressed: lt > 30, value: lt / 255 },  // 6  – LT / L2 (analog)
    { pressed: rt > 30, value: rt / 255 },  // 7  – RT / R2 (analog)
    bit(BTN.BACK),           // 8  – Back / Select / Share
    bit(BTN.START),          // 9  – Start / Options
    bit(BTN.LEFT_THUMB),     // 10 – L3
    bit(BTN.RIGHT_THUMB),    // 11 – R3
    bit(BTN.DPAD_UP),        // 12 – D-Pad Up
    bit(BTN.DPAD_DOWN),      // 13 – D-Pad Down
    bit(BTN.DPAD_LEFT),      // 14 – D-Pad Left
    bit(BTN.DPAD_RIGHT),     // 15 – D-Pad Right
  ]

  // Gamepad API axes: -1..1, LY & RY are inverted per spec
  const axes = [
    lx / 32767,    // axes[0] – Left X
    -ly / 32767,   // axes[1] – Left Y
    rx / 32767,    // axes[2] – Right X
    -ry / 32767,   // axes[3] – Right Y
  ]

  return { buttons, axes, connected: true }
}

function getExecutablePath(): string {
  const possiblePaths = [
    path.join(__dirname, 'native/XInputReader.exe'),
    path.join(__dirname, '../electron/native/XInputReader.exe'),
    path.join(app.getAppPath(), 'electron/native/XInputReader.exe'),
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
      execSync(`"${csc}" /nologo /optimize /target:exe /out:"${targetExe}" "${csSource}"`)
      if (fs.existsSync(targetExe)) return targetExe
    } catch (err) {
      console.warn('[GamepadService] Failed to auto-compile XInputReader:', err)
    }
  }

  return possiblePaths[0]
}

export function startGamepadService(getOverlay: () => BrowserWindow | null) {
  if (isRunning) return
  isRunning = true
  overlayWinRef = getOverlay

  const exePath = getExecutablePath()
  if (!fs.existsSync(exePath)) {
    console.warn('[GamepadService] XInputReader.exe not found at:', exePath)
    return
  }

  try {
    xinputProc = spawn(exePath, [], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (err) {
    console.error('[GamepadService] Failed to spawn XInputReader:', err)
    return
  }

  let lineBuffer = ''

  xinputProc.stdout?.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString('utf8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = JSON.parse(trimmed)
        const overlayWin = overlayWinRef?.()
        if (!overlayWin || overlayWin.isDestroyed()) continue

        if (!raw.c) {
          overlayWin.webContents.send('overlay:gamepad-state', { connected: false })
          continue
        }

        const state = xInputToGamepadAPI(raw)
        overlayWin.webContents.send('overlay:gamepad-state', state)
      } catch {}
    }
  })

  xinputProc.on('exit', (code) => {
    xinputProc = null
    if (isRunning) {
      setTimeout(() => {
        if (isRunning) startGamepadService(getOverlay)
      }, 1000)
    }
  })

  console.log('[GamepadService] Native XInputReader service started successfully.')
}

export function stopGamepadService() {
  if (!isRunning && !xinputProc) return
  isRunning = false
  overlayWinRef = null
  if (xinputProc) {
    try {
      xinputProc.kill()
    } catch {}
    xinputProc = null
  }
  console.log('[GamepadService] Native XInputReader stopped.')
}
