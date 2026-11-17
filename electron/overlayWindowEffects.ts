import { app, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

export function disableChromiumWindowAnimations(): void {
  // Chromium's Aura compositor animates window visibility separately from CSS
  // and DWM. This must be set before creating the first BrowserWindow.
  // https://source.chromium.org/chromium/chromium/src/+/main:ui/wm/core/window_animations.cc
  if (process.platform === 'win32') app.commandLine.appendSwitch('wm-window-animations-disabled')
}

export function disableOverlayWindowTransitions(window: BrowserWindow): Promise<void> | undefined {
  if (process.platform !== 'win32' || typeof window.getNativeWindowHandle !== 'function') return
  const handle = window.getNativeWindowHandle()
  if (handle.length !== 4 && handle.length !== 8) return Promise.reject(new Error('Invalid overlay window handle'))
  const id = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE())
  const candidates = [
    path.join(app.getAppPath(), 'electron/native/OverlayWindowEffects.exe').replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2'),
    path.join(__dirname, '../electron/native/OverlayWindowEffects.exe'),
  ]
  const helper = candidates.find(file => fs.existsSync(file))
  if (!helper) return Promise.reject(new Error('Overlay window effects helper is missing'))
  // Runs once before the first show, exits immediately, and never polls input.
  return new Promise<void>((resolve, reject) => {
    execFile(helper, [id, String(process.pid)], { windowsHide: true, timeout: 2000, maxBuffer: 1024 }, (error, output) => {
      if (error) reject(error)
      else if (output.trim() !== '1') reject(new Error('Windows did not disable overlay transitions'))
      else resolve()
    })
  })
}
