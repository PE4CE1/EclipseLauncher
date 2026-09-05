import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'
import { startMetricsService, stopMetricsService } from './metricsService'
import { startInputService, stopInputService } from './inputService'
import { startGamepadService, stopGamepadService } from './gamepadService'
import { updateStreamGameTitle, isStreamStudioOpen } from './streamManager'

let overlayWindow: BrowserWindow | null = null
let isEditMode = false

export function initOverlayManager(_devUrl: string | undefined) {
  // Dev URL is read directly from env
}

export function getOverlayWindow() {
  return overlayWindow
}

export function isEditModeActive() {
  return isEditMode
}

function loadOverlay() {
  const devServerUrl = process.env['VITE_DEV_SERVER_URL']
  if (devServerUrl) {
    const baseUrl = devServerUrl.endsWith('/') ? devServerUrl.slice(0, -1) : devServerUrl
    overlayWindow!.loadURL(`${baseUrl}/overlay.html`)
    console.log(`[OverlayManager] Loading overlay from dev server: ${baseUrl}/overlay.html`)
  } else {
    overlayWindow!.loadFile(path.join(__dirname, '../dist/overlay.html'))
    console.log(`[OverlayManager] Loading overlay from dist`)
  }
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const displayBounds = primaryDisplay.bounds

  overlayWindow = new BrowserWindow({
    x: displayBounds.x,
    y: displayBounds.y,
    width: displayBounds.width,
    height: displayBounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    }
  })

  overlayWindow.setBounds(displayBounds)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)

  // Critical for Borderless Windowed FPS: 
  // Limit overlay to 30 FPS so DWM doesn't force the game's swapchain to sync at high refresh rates
  overlayWindow.webContents.setFrameRate(30)

  loadOverlay()

  overlayWindow.on('closed', () => {
    overlayWindow = null
    stopMetricsService()
    stopInputService()
    isEditMode = false
  })

  return overlayWindow
}

export function showOverlay(gameData: any) {
  const s = gameData?.settings
  const gameName = gameData?.name || gameData?.title || null
  updateStreamGameTitle(gameName)

  // Check if controller is running in "Stream Only" mode (invisible on desktop)
  const isControllerStreamOnly = !!s?.overlayControllerStreamOnly
  const isControllerActive = !!(s?.overlayController || s?.overlayRLController)

  // If controller is active (even if stream only), keep gamepad service running
  if (isControllerActive) {
    startGamepadService(getOverlayWindow)
  }

  // Determine if any visible widget should appear on the desktop overlay
  const isAnyDesktopOverlayActive = s && (
    s.performance || s.crosshair || s.cps || s.robloxCps || s.robloxTimer || 
    s.rlHud || s.overlayRLSteam || (!isControllerStreamOnly && isControllerActive) || s.overlayMedia
  )

  if (!isAnyDesktopOverlayActive && !isEditMode) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      try {
        overlayWindow.destroy()
      } catch (_) {}
      overlayWindow = null
    }
    return
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (s?.performance || s?.robloxTimer) {
      startMetricsService(getOverlayWindow)
    }
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      const curBounds = overlayWindow.getBounds()
      if (curBounds.width !== primaryDisplay.bounds.width || curBounds.height !== primaryDisplay.bounds.height || curBounds.x !== primaryDisplay.bounds.x || curBounds.y !== primaryDisplay.bounds.y) {
        overlayWindow.setBounds(primaryDisplay.bounds)
      }
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      overlayWindow.moveTop()
    } catch (_) {}
    overlayWindow.webContents.send('overlay:update', gameData)
    return
  }

  createOverlayWindow()

  overlayWindow!.once('ready-to-show', () => {
    overlayWindow?.show()
    if (s?.performance || s?.robloxTimer) {
      startMetricsService(getOverlayWindow)
    }
    if (s?.cps || s?.robloxCps || s?.rlHud) {
      startInputService(overlayWindow!)
    }
    if (s?.overlayController || s?.overlayRLController) {
      startGamepadService(getOverlayWindow)
    }
    overlayWindow?.webContents.send('overlay:update', gameData)
  })
  overlayWindow!.webContents.once('did-finish-load', () => {
    overlayWindow?.webContents.send('overlay:update', gameData)
  })
}

export function hideOverlay(force: boolean = false) {
  if (isEditMode && !force) {
    return
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.destroy()
    } catch (_) {
      overlayWindow.close()
    }
    overlayWindow = null
  }
  stopMetricsService()
  stopInputService()
  stopGamepadService()
  isEditMode = false
}

// ─── Edit Mode (Discord-style drag) ───────────────────────────────────────────

export function openOverlayEditMode(gameData?: any) {
  isEditMode = true
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    // No active overlay – open a preview window for editing
    createOverlayWindow()
    overlayWindow!.once('ready-to-show', () => {
      overlayWindow?.show()
      startMetricsService(getOverlayWindow)
      startInputService(overlayWindow!)
      startGamepadService(getOverlayWindow)
      enterEditMode(gameData)
    })
    overlayWindow!.webContents.once('did-finish-load', () => {
      enterEditMode(gameData)
    })
    return
  }
  enterEditMode(gameData)
}

function enterEditMode(gameData?: any) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  isEditMode = true
  overlayWindow.setIgnoreMouseEvents(false)
  overlayWindow.setFocusable(true)
  overlayWindow.focus()
  overlayWindow.webContents.send('overlay:edit-start', gameData || null)
}

export function exitEditMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  isEditMode = false
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setFocusable(false)
  overlayWindow.webContents.send('overlay:edit-end')
}

ipcMain.on('overlay:set-ignore-mouse', (_event, ignore: boolean) => {
  if (overlayWindow && !overlayWindow.isDestroyed() && !isEditMode) {
    if (ignore) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      overlayWindow.setIgnoreMouseEvents(false)
    }
  }
})

