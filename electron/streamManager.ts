import { BrowserWindow, desktopCapturer, ipcMain } from 'electron'
import path from 'path'
import { startGamepadService } from './gamepadService'

let streamWindow: BrowserWindow | null = null
let currentStreamTitle = 'Eclipse Stream: Ready'
let activeGameName: string | null = null
let isOffScreen = false
let lastNormalBounds: { x?: number; y?: number; width: number; height: number } = { width: 1920, height: 1080 }

export function getStreamWindow(): BrowserWindow | null {
  return streamWindow && !streamWindow.isDestroyed() ? streamWindow : null
}

export function isStreamStudioOpen(): boolean {
  return streamWindow !== null && !streamWindow.isDestroyed()
}

export function updateStreamGameTitle(gameName: string | null) {
  activeGameName = gameName
  if (gameName) {
    currentStreamTitle = `Eclipse Stream: ${gameName}`
  } else {
    currentStreamTitle = 'Eclipse Stream: Game Live'
  }
  if (streamWindow && !streamWindow.isDestroyed()) {
    streamWindow.setTitle(currentStreamTitle)
    streamWindow.webContents.send('stream:game-update', { gameName, title: currentStreamTitle })
  }
}

function loadStreamContent() {
  if (!streamWindow) return
  const devServerUrl = process.env['VITE_DEV_SERVER_URL']
  if (devServerUrl) {
    const baseUrl = devServerUrl.endsWith('/') ? devServerUrl.slice(0, -1) : devServerUrl
    streamWindow.loadURL(`${baseUrl}/stream.html`)
  } else {
    streamWindow.loadFile(path.join(__dirname, '../dist/stream.html'))
  }
}

export function openStreamStudio(gameName?: string): BrowserWindow {
  if (gameName) {
    activeGameName = gameName
    currentStreamTitle = `Eclipse Stream: ${gameName}`
  }

  if (streamWindow && !streamWindow.isDestroyed()) {
    if (isOffScreen) {
      streamWindow.setBounds(lastNormalBounds || { width: 1920, height: 1080 })
      streamWindow.center()
      isOffScreen = false
    }
    if (streamWindow.isMinimized()) streamWindow.restore()
    streamWindow.show()
    streamWindow.focus()
    streamWindow.setTitle(currentStreamTitle)
    return streamWindow
  }

  streamWindow = new BrowserWindow({
    title: currentStreamTitle,
    width: 1920,
    height: 1080,
    useContentSize: true,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#07080a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    }
  })

  // Critical: prevent Chromium from throttling video rendering or JS loop when occluded/background
  streamWindow.webContents.setBackgroundThrottling(false)

  // Start native gamepad reader so controller inputs feed the stream window
  startGamepadService(() => streamWindow)

  streamWindow.once('ready-to-show', () => {
    if (streamWindow && !streamWindow.isDestroyed()) {
      streamWindow.show()
      streamWindow.setTitle(currentStreamTitle)
      streamWindow.webContents.send('stream:game-update', { gameName: activeGameName, title: currentStreamTitle })
    }
  })

  loadStreamContent()

  streamWindow.on('closed', () => {
    streamWindow = null
    isOffScreen = false
  })

  return streamWindow
}

export function closeStreamStudio() {
  if (streamWindow && !streamWindow.isDestroyed()) {
    try {
      streamWindow.close()
    } catch (_) {}
    streamWindow = null
    isOffScreen = false
  }
}

export function initStreamManager() {
  // IPC: Get capture sources via desktopCapturer for seamless game video capture
  ipcMain.handle('stream:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 640, height: 360 },
        fetchWindowIcons: true
      })
      return sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      }))
    } catch (err: any) {
      console.warn('[StreamManager] desktopCapturer error:', err)
      return []
    }
  })

  // IPC: Toggle or open stream studio
  ipcMain.handle('stream:open', async (_event, gameName?: string) => {
    openStreamStudio(gameName)
    return { success: true, title: currentStreamTitle }
  })

  ipcMain.handle('stream:close', async () => {
    closeStreamStudio()
    return { success: true }
  })

  // Set stream window content resolution
  ipcMain.handle('stream:set-resolution', async (_event, payload: { width: number; height: number }) => {
    if (streamWindow && !streamWindow.isDestroyed() && !isOffScreen) {
      const { width, height } = payload
      streamWindow.setContentSize(width, height)
    }
    return { success: true }
  })

  // Off-screen minimization keeps Direct3D / DWM buffer rendering at 60 FPS without Windows pausing or Discord disconnecting
  ipcMain.handle('stream:minimize', async () => {
    if (streamWindow && !streamWindow.isDestroyed()) {
      lastNormalBounds = streamWindow.getBounds()
      isOffScreen = true
      streamWindow.setPosition(-20000, -20000)
    }
    return { success: true }
  })

  ipcMain.handle('stream:restore', async () => {
    if (streamWindow && !streamWindow.isDestroyed()) {
      if (isOffScreen) {
        streamWindow.setBounds(lastNormalBounds || { width: 1920, height: 1080 })
        streamWindow.center()
        isOffScreen = false
      }
      if (streamWindow.isMinimized()) streamWindow.restore()
      streamWindow.show()
      streamWindow.focus()
    }
    return { success: true }
  })

  ipcMain.handle('stream:maximize', async () => {
    if (streamWindow && !streamWindow.isDestroyed()) {
      if (isOffScreen) {
        streamWindow.setBounds(lastNormalBounds || { width: 1920, height: 1080 })
        streamWindow.center()
        isOffScreen = false
      }
      if (streamWindow.isMaximized()) {
        streamWindow.unmaximize()
      } else {
        streamWindow.maximize()
      }
    }
    return { success: true }
  })

  ipcMain.handle('stream:status', async () => {
    return {
      isOpen: isStreamStudioOpen(),
      isOffScreen,
      title: currentStreamTitle,
      activeGame: activeGameName
    }
  })

  ipcMain.handle('stream:set-title', async (_event, title: string) => {
    currentStreamTitle = title
    if (streamWindow && !streamWindow.isDestroyed()) {
      streamWindow.setTitle(title)
    }
    return { success: true }
  })
}
