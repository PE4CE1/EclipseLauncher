import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'
import { startMetricsService, stopMetricsService } from './metricsService'
import { startInputService, stopInputService } from './inputService'
import { startGamepadService, stopGamepadService } from './gamepadService'

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
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:update', gameData)
    return
  }

  createOverlayWindow()

  overlayWindow!.once('ready-to-show', () => {
    overlayWindow?.show()
    startMetricsService(getOverlayWindow)
    startInputService(overlayWindow!)
    startGamepadService(getOverlayWindow)
    overlayWindow?.webContents.send('overlay:update', gameData)
  })
  overlayWindow!.webContents.once('did-finish-load', () => {
    overlayWindow?.webContents.send('overlay:update', gameData)
  })
}

export function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
  stopMetricsService()
  stopInputService()
  stopGamepadService()
  isEditMode = false
}

// ─── Edit Mode (Discord-style drag) ───────────────────────────────────────────

export function openOverlayEditMode(gameData?: any) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    // No active overlay – open a preview window for editing
    createOverlayWindow()
    overlayWindow!.once('ready-to-show', () => {
      overlayWindow?.show()
      startMetricsService(getOverlayWindow)
      startInputService(overlayWindow!)
      startGamepadService(getOverlayWindow)
      overlayWindow?.webContents.send('overlay:edit-mode', true)
      setTimeout(() => {
        enterEditMode(gameData)
      }, 1000)
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
