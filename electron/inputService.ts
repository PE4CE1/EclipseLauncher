import { uIOhook, UiohookKey } from 'uiohook-napi'
import { BrowserWindow } from 'electron'

let isScoreboardOpen = false
let kbBind = 'Tab' // default
let ctrlBind = 'Select' // default
let isHookRunning = false

let overlayWin: BrowserWindow | null = null

let leftClicks: number[] = []
let rightClicks: number[] = []
let cpsDecayInterval: NodeJS.Timeout | null = null
let lastEmittedLmb = 0
let lastEmittedRmb = 0
let pendingDispatch = false
let latestButtonClicked: 'lmb' | 'rmb' | undefined = undefined

let lastLmbClickTime = 0
let lastRmbClickTime = 0

function pruneClicks(now: number) {
  while (leftClicks.length > 0 && now - leftClicks[0] > 1000) {
    leftClicks.shift()
  }
  while (rightClicks.length > 0 && now - rightClicks[0] > 1000) {
    rightClicks.shift()
  }
}

function flushCps() {
  pendingDispatch = false
  if (!overlayWin || overlayWin.isDestroyed()) return
  const now = Date.now()
  pruneClicks(now)
  const lmb = leftClicks.length
  const rmb = rightClicks.length
  const total = lmb + rmb
  const btn = latestButtonClicked
  latestButtonClicked = undefined

  if (btn !== undefined || lmb !== lastEmittedLmb || rmb !== lastEmittedRmb) {
    lastEmittedLmb = lmb
    lastEmittedRmb = rmb
    overlayWin.webContents.send('overlay:cps-update', { lmb, rmb, total, buttonClicked: btn })
  }
}

function scheduleCpsUpdate(button?: 'lmb' | 'rmb') {
  if (button) latestButtonClicked = button
  if (pendingDispatch) return
  pendingDispatch = true
  setImmediate(flushCps)
}

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

const handleMouseDown = (e: any) => {
  if (!overlayWin || overlayWin.isDestroyed()) return
  const now = Date.now()
  if (e.button === 1) {
    // 10ms hardware debounce to prevent duplicate micro-switch bounce events
    if (now - lastLmbClickTime >= 10) {
      lastLmbClickTime = now
      leftClicks.push(now)
      scheduleCpsUpdate('lmb')
    }
  } else if (e.button === 2) {
    if (now - lastRmbClickTime >= 10) {
      lastRmbClickTime = now
      rightClicks.push(now)
      scheduleCpsUpdate('rmb')
    }
  }
}

export function startInputService(overlayWindow: BrowserWindow) {
  overlayWin = overlayWindow

  if (!isHookRunning) {
    try {
      // Remove any stale listeners first to guarantee strictly ONE listener
      uIOhook.removeAllListeners()

      // FAST-PATH: Override uIOhook.handler to immediately drop mousemove (9), mousewheel (11), click (6)
      // This prevents 1000Hz gaming mouse movement from triggering any V8/JS overhead or micro-stutters in 3D games!
      ;(uIOhook as any).handler = function (e: any) {
        if (e.type === 9 || e.type === 11 || e.type === 6) return
        if (e.type === 7) {
          this.emit('mousedown', e)
          return
        }
        if (e.type === 8) {
          this.emit('mouseup', e)
          return
        }
        if (e.type === 4) {
          this.emit('keydown', e)
          return
        }
        if (e.type === 5) {
          this.emit('keyup', e)
          return
        }
      }

      uIOhook.on('keydown', (e) => handleKeyEvent(e, true))
      uIOhook.on('keyup', (e) => handleKeyEvent(e, false))
      uIOhook.on('mousedown', handleMouseDown)
      uIOhook.start()
      isHookRunning = true
      console.log('[InputService] uIOhook global keyboard and mouse listeners started.')

      if (!cpsDecayInterval) {
        cpsDecayInterval = setInterval(() => {
          if (!overlayWin || overlayWin.isDestroyed()) return
          if (leftClicks.length > 0 || rightClicks.length > 0 || lastEmittedLmb > 0 || lastEmittedRmb > 0) {
            const now = Date.now()
            pruneClicks(now)
            const lmb = leftClicks.length
            const rmb = rightClicks.length
            const total = lmb + rmb
            if (lmb !== lastEmittedLmb || rmb !== lastEmittedRmb) {
              lastEmittedLmb = lmb
              lastEmittedRmb = rmb
              overlayWin.webContents.send('overlay:cps-update', { lmb, rmb, total })
            }
          }
        }, 40)
      }
    } catch (err) {
      console.error('[InputService] Failed to start input listeners:', err)
    }
  }
}

export function stopInputService() {
  if (isHookRunning) {
    try {
      uIOhook.removeAllListeners()
      uIOhook.stop()
    } catch (_) {}
    isHookRunning = false
  }
  if (cpsDecayInterval) {
    clearInterval(cpsDecayInterval)
    cpsDecayInterval = null
  }
  leftClicks = []
  rightClicks = []
  lastEmittedLmb = 0
  lastEmittedRmb = 0
  lastLmbClickTime = 0
  lastRmbClickTime = 0
  pendingDispatch = false
  latestButtonClicked = undefined
  isScoreboardOpen = false
  overlayWin = null
}

export function setInputKeybinds(keyboardKey: string, controllerKey: string) {
  if (keyboardKey) kbBind = keyboardKey
  if (controllerKey) ctrlBind = controllerKey
  console.log(`[InputService] Keybinds updated. KB: ${kbBind}, CTRL: ${ctrlBind}`)
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('rl:controller-bind-update', ctrlBind)
  }
}
