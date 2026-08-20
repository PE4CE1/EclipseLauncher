/**
 * xinputService.ts
 *
 * Reads gamepad / controller state directly from the Windows XInput API via a
 * persistent PowerShell child process.  Because we call XInputGetState()
 * through xinput1_4.dll (always available on Win 8+), this works completely
 * independently of which window / application has OS focus.
 *
 * State is converted to the standard Gamepad API format and forwarded to the
 * overlay BrowserWindow via IPC so the ControllerOverlay can render it.
 */

import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

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
  const bitmask: number = raw.buttons
  const lt: number = raw.lt   // 0-255
  const rt: number = raw.rt   // 0-255
  const lx: number = raw.lx  // -32768..32767
  const ly: number = raw.ly
  const rx: number = raw.rx
  const ry: number = raw.ry

  const bit = (mask: number) => {
    const pressed = (bitmask & mask) !== 0
    return { pressed, value: pressed ? 1.0 : 0.0 }
  }

  // Standard Gamepad API button layout (matches Xbox + most PS pads)
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

  // Gamepad API axes: -1..1, LY & RY are inverted
  const axes = [
    lx / 32767,    // axes[0] – Left X
    -ly / 32767,   // axes[1] – Left Y  (inverted per spec)
    rx / 32767,    // axes[2] – Right X
    -ry / 32767,   // axes[3] – Right Y (inverted per spec)
  ]

  return { buttons, axes, connected: true }
}

// ─── PowerShell script that reads XInput in a tight loop ─────────────────────
// Uses Add-Type to P/Invoke xinput1_4.dll (ships with Windows 8+).
// Outputs one JSON line per ~16 ms for the first connected controller.
const POWERSHELL_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)]
public struct XINPUT_GAMEPAD {
    public UInt16 wButtons;
    public Byte   bLeftTrigger;
    public Byte   bRightTrigger;
    public Int16  sThumbLX;
    public Int16  sThumbLY;
    public Int16  sThumbRX;
    public Int16  sThumbRY;
}
[StructLayout(LayoutKind.Sequential)]
public struct XINPUT_STATE {
    public UInt32        dwPacketNumber;
    public XINPUT_GAMEPAD Gamepad;
}
public class XInput {
    [DllImport("xinput1_4.dll")]
    public static extern UInt32 XInputGetState(UInt32 userIndex, ref XINPUT_STATE pState);
}
"@

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
    $found = $false
    for ($i = 0; $i -lt 4; $i++) {
        $s = New-Object XINPUT_STATE
        if ([XInput]::XInputGetState($i, [ref]$s) -eq 0) {
            $g = $s.Gamepad
            [Console]::WriteLine('{"c":1,"b":' + $g.wButtons + ',"lt":' + $g.bLeftTrigger + ',"rt":' + $g.bRightTrigger + ',"lx":' + $g.sThumbLX + ',"ly":' + $g.sThumbLY + ',"rx":' + $g.sThumbRX + ',"ry":' + $g.sThumbRY + '}')
            $found = $true
            break
        }
    }
    if (-not $found) {
        [Console]::WriteLine('{"c":0}')
    }
    Start-Sleep -Milliseconds 16
}
`

// ─── Public API ──────────────────────────────────────────────────────────────

export function startGamepadService(getOverlay: () => BrowserWindow | null) {
  if (isRunning) return
  isRunning = true
  overlayWinRef = getOverlay

  // Write the PowerShell script to a temp file
  const scriptPath = path.join(os.tmpdir(), 'eclipse_xinput_reader.ps1')
  try {
    fs.writeFileSync(scriptPath, POWERSHELL_SCRIPT, 'utf8')
  } catch (err) {
    console.error('[GamepadService] Could not write PS script:', err)
    return
  }

  xinputProc = spawn('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
  ])

  let lineBuffer = ''

  xinputProc.stdout?.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''   // keep incomplete last line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = JSON.parse(trimmed)
        if (!raw.c) return  // no controller connected

        const state = xInputToGamepadAPI({
          buttons: raw.b,
          lt: raw.lt,
          rt: raw.rt,
          lx: raw.lx,
          ly: raw.ly,
          rx: raw.rx,
          ry: raw.ry,
        })

        const overlayWin = overlayWinRef?.()
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send('overlay:gamepad-state', state)
        }
      } catch {
        // Ignore malformed JSON lines
      }
    }
  })

  xinputProc.stderr?.on('data', (chunk: Buffer) => {
    console.warn('[GamepadService] PS stderr:', chunk.toString().trim())
  })

  xinputProc.on('error', (err) => {
    console.error('[GamepadService] Failed to start PowerShell:', err)
  })

  xinputProc.on('exit', (code) => {
    if (isRunning) {
      console.warn(`[GamepadService] PS process exited with code ${code}, restarting…`)
      setTimeout(() => {
        xinputProc = null
        if (isRunning) startGamepadService(getOverlay)
      }, 1000)
    }
  })

  console.log('[GamepadService] XInput reader started via PowerShell.')
}

export function stopGamepadService() {
  isRunning = false
  overlayWinRef = null
  if (xinputProc) {
    xinputProc.kill()
    xinputProc = null
  }
  console.log('[GamepadService] Stopped.')
}
