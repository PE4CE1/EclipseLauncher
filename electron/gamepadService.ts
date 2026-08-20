import { BrowserWindow, app } from 'electron'
import path from 'path'

let gamepadWindow: BrowserWindow | null = null
let overlayWinRef: (() => BrowserWindow | null) | null = null
let isRunning = false

const GAMEPAD_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
  const POLL_MS = 16; // ~60fps

  function getState() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    // Prefer gamepad with active input
    for (let i = 0; i < gamepads.length; i++) {
      const g = gamepads[i];
      if (!g || !g.connected) continue;
      const active = g.buttons.some(b => b && (b.pressed || b.value > 0.05)) ||
                     g.axes.some(a => Math.abs(a) > 0.1);
      if (active) { best = g; break; }
    }
    // Fallback to first connected
    if (!best) {
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) { best = gamepads[i]; break; }
      }
    }
    if (!best) return null;
    return {
      buttons: best.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
      axes: Array.from(best.axes),
      connected: true
    };
  }

  setInterval(() => {
    const state = getState();
    window.electronAPI.sendGamepadState(state);
  }, ${16});
</script>
</body>
</html>`

export function startGamepadService(getOverlay: () => BrowserWindow | null) {
  if (isRunning) return
  isRunning = true
  overlayWinRef = getOverlay

  gamepadWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'gamepadPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    }
  })

  gamepadWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(GAMEPAD_HTML))

  // Force gamepad access by briefly showing and focusing
  gamepadWindow.once('ready-to-show', () => {
    // Make it invisible but keep it "shown" so gamepad API works
    gamepadWindow?.setOpacity(0)
    gamepadWindow?.show()
    gamepadWindow?.blur()
  })

  console.log('[GamepadService] Gamepad reader window started.')
}

export function sendGamepadStateToOverlay(state: any) {
  if (!overlayWinRef) return
  const overlayWin = overlayWinRef()
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('overlay:gamepad-state', state)
  }
}

export function stopGamepadService() {
  isRunning = false
  overlayWinRef = null
  if (gamepadWindow && !gamepadWindow.isDestroyed()) {
    gamepadWindow.close()
    gamepadWindow = null
  }
  console.log('[GamepadService] Stopped.')
}
