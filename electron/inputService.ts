import { uIOhook, UiohookKey } from 'uiohook-napi'
import { BrowserWindow } from 'electron'

let isScoreboardOpen = false
let kbBind = 'Tab' // default
let ctrlBind = 'Select' // default
let isHookRunning = false

let overlayWin: BrowserWindow | null = null

// Simple controller polling since Gamepad API requires a renderer
// Wait, we can't easily poll controllers in main process without native modules.
// We will send a message to the hidden scraperWin (or overlay win) to poll controllers
// Actually, it's easiest to just let the overlay window itself poll for the controller.
// This inputService will just handle Keyboard, and broadcast the state to the overlay.
// The overlay will combine it with its own gamepad polling.

export function startInputService(overlayWindow: BrowserWindow) {
  overlayWin = overlayWindow
  if (!isHookRunning) {
    try {
      const handleKeyEvent = (e: any, isDown: boolean) => {
        if (!overlayWin || overlayWin.isDestroyed()) return
        
        // Find key name from UiohookKey enum based on keycode
        const keyName = Object.keys(UiohookKey).find(k => (UiohookKey as any)[k] === e.keycode)
        const pressedKey = keyName?.toUpperCase()
        const bindKey = kbBind.toUpperCase()

        if (pressedKey === bindKey) {
          if (isDown !== isScoreboardOpen) {
            isScoreboardOpen = isDown
            overlayWin.webContents.send('rl:scoreboard-toggle', isDown)
          }
        }
      }

      uIOhook.on('keydown', (e) => handleKeyEvent(e, true))
      uIOhook.on('keyup', (e) => handleKeyEvent(e, false))
      uIOhook.start()
      isHookRunning = true
      console.log('[InputService] uIOhook global keyboard listener started.')
    } catch (err) {
      console.error('[InputService] Failed to start keyboard listener:', err)
    }
  }
}

export function stopInputService() {
  if (isHookRunning) {
    uIOhook.stop()
    isHookRunning = false
  }
  isScoreboardOpen = false
  overlayWin = null
}

export function setInputKeybinds(keyboardKey: string, controllerKey: string) {
  if (keyboardKey) kbBind = keyboardKey
  if (controllerKey) ctrlBind = controllerKey
  console.log(`[InputService] Keybinds updated. KB: ${kbBind}, CTRL: ${ctrlBind}`)
  // The overlay window will handle the controller keybind via a store or IPC broadcast.
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('rl:controller-bind-update', ctrlBind)
  }
}
