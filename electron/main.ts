import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification } from 'electron'

if (require('electron-squirrel-startup')) {
  app.quit()
}

import { execFile, ChildProcess, exec } from 'child_process'

import path from 'path'
import fs from 'fs'
import { scanGames } from './scanner'
import { initTorrentIPC } from './torrentService'
import { initHttpDownloadIPC } from './httpDownloadService'
import { initUpdater } from './updaterService'
import { initDiscordRPC, setDiscordActivity, clearDiscordActivity, setDiscordIdleActivity } from './discordRPC'
import { startProcessMonitor, registerGameExe, getCurrentDetectedGame } from './processMonitor'
import { initOverlayManager, openOverlayEditMode, exitEditMode, getOverlayWindow } from './overlayManager'
import { setRLPlaylist, setRLApiKey, destroyRLScraper } from './rlService'
import { fetchSteamAvatar } from './steamService'
import { startInputService, stopInputService, setInputKeybinds } from './inputService'



// vite-plugin-electron sets this in dev mode
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isDev = !!DEV_SERVER_URL

app.name = 'Eclipse Launcher'
if (process.platform === 'win32') {
  app.setAppUserModelId(process.execPath || 'Eclipse Launcher')
} else {
  app.setAppUserModelId('Eclipse Launcher')
}
app.setPath('userData', path.join(app.getPath('appData'), 'GameHub'))

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function getSavedSettings(): Record<string, any> {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
  } catch {}
  return {}
}

// Check hardware acceleration setting on launch (Default: true)
const startupSettings = getSavedSettings()
if (startupSettings.hardwareAcceleration === false) {
  app.disableHardwareAcceleration()
} else {
  // Enable high-performance GPU hardware acceleration (60fps - 120fps+ support)
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('high-dpi-support', '1')
}

let mainWindow: BrowserWindow | null = null
let friendsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function getAppIconPath(): string {
  const candidates = [
    path.join(__dirname, '../public/eclipselauncher.png'),
    path.join(app.getAppPath(), 'public/eclipselauncher.png'),
    path.join(app.getAppPath(), 'dist/eclipselauncher.png'),
    path.join(__dirname, 'eclipselauncher.png'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

function createSystemTray() {
  if (tray) return
  
  initOverlayManager(DEV_SERVER_URL)
  const iconPath = getAppIconPath()
  const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(img)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Eclipse Launcher',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit Eclipse',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setToolTip('Eclipse Launcher')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createFriendsWindow() {
  if (friendsWindow) {
    friendsWindow.focus()
    return
  }

  friendsWindow = new BrowserWindow({
    width: 320,
    height: 520,
    minWidth: 320,
    minHeight: 520,
    resizable: false,
    frame: false,
    transparent: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
    icon: fs.existsSync(getAppIconPath()) ? getAppIconPath() : undefined,
  })

  if (isDev && DEV_SERVER_URL) {
    friendsWindow.loadURL(`${DEV_SERVER_URL}#friends`)
  } else {
    friendsWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}#friends`)
  }

  friendsWindow.once('ready-to-show', () => {
    friendsWindow?.show()
  })

  friendsWindow.on('closed', () => {
    friendsWindow = null
  })
}

function createWindow() {
  const settings = getSavedSettings()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#040405',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // Allows renderer to fetch from Steam API (bypasses CORS)
    },
    icon: fs.existsSync(getAppIconPath()) ? getAppIconPath() : undefined,
  })

  mainWindow.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward') {
      e.preventDefault()
      mainWindow?.webContents.send('navigation:back')
    } else if (cmd === 'browser-forward') {
      e.preventDefault()
      mainWindow?.webContents.send('navigation:forward')
    }
  })

  const startOnBoot = settings.startOnBoot !== false
  const startMinimized = !!settings.startMinimized

  try {
    app.setLoginItemSettings({
      openAtLogin: startOnBoot,
      openAsHidden: startMinimized,
    })
  } catch {}

  if (!startMinimized) {
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })

    // Fallback: show the window after 4 seconds regardless
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
        mainWindow.focus()
      }
    }, 4000)
  }

  if (isDev && DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    const currentSettings = getSavedSettings()
    const exitInsteadOfMinimize = currentSettings.exitInsteadOfMinimize ?? true
    if (!exitInsteadOfMinimize) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  // Initialize IPC services
  initTorrentIPC(ipcMain, mainWindow)
  initHttpDownloadIPC(ipcMain, mainWindow)
  
  // Initialize Auto Updater
  initUpdater(mainWindow)
  
  // Initialize Discord RPC
  initDiscordRPC()

  // Start background process monitoring for running games on Windows
  startProcessMonitor(() => mainWindow)
}

app.on('before-quit', () => {
  isQuitting = true
})

// Gamepad state forwarder from main window to overlay window
ipcMain.handle('rl:gamepad-state', (event, isPressed: boolean) => {
  const overlay = getOverlayWindow()
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('rl:scoreboard-toggle', isPressed)
  }
})

// ─── Window Controls ────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:hide', () => mainWindow?.hide())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

ipcMain.on('window:set-size', (e, width: number, height: number, center: boolean) => {
  if (mainWindow) {
    mainWindow.setMinimumSize(1100, 700)
    mainWindow.setSize(width, height)
    if (center) mainWindow.center()
  }
})

ipcMain.on('window:set-resizable', (e, resizable: boolean) => {
  if (mainWindow) mainWindow.setResizable(resizable)
})

ipcMain.handle('system:set-auto-launch', (_event, { enabled, startMinimized }: { enabled: boolean, startMinimized: boolean }) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: startMinimized,
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
})

ipcMain.handle('system:open-path', async (_event, fullPath: string) => {
  try {
    if (!fullPath) return { success: false, error: 'No path provided' }
    const errorMsg = await shell.openPath(fullPath)
    if (errorMsg) {
      if (fs.existsSync(fullPath)) {
        shell.showItemInFolder(fullPath)
        return { success: true }
      }
      return { success: false, error: errorMsg }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
})

// ─── Game Scanner ────────────────────────────────────────────────────────────
ipcMain.handle('games:current', () => {
  return getCurrentDetectedGame()
})

ipcMain.handle('games:scan', async (_event) => {
  try {
    const games = await scanGames((progress) => {
      mainWindow?.webContents.send('games:scan-progress', progress)
    })
    games.forEach(g => {
      if (g.installPath && g.installPath.endsWith('.exe')) {
        registerGameExe(path.basename(g.installPath), g.name)
      }
      if (g.launchUrl && g.launchUrl.endsWith('.exe')) {
        registerGameExe(path.basename(g.launchUrl), g.name)
      }
      if (g.installPath && !g.installPath.endsWith('.exe')) {
        try {
          if (fs.existsSync(g.installPath)) {
            const files = fs.readdirSync(g.installPath)
            for (const file of files) {
              if (file.toLowerCase().endsWith('.exe')) {
                const lowerName = file.toLowerCase()
                const genericExes = [
                  'unins000.exe', 'uninstall.exe', 'launcher.exe', 'setup.exe', 
                  'dxwebsetup.exe', 'vcredist_x64.exe', 'vcredist_x86.exe', 
                  'crashreporter.exe', 'crashpad_handler.exe', 'senddump.exe', 
                  'unitycrashhandler64.exe', 'unitycrashhandler32.exe', 'eac_setup.exe',
                  'anticheat_setup.exe'
                ]
                if (!genericExes.includes(lowerName)) {
                  registerGameExe(file, g.name)
                }
              }
            }
          }
        } catch (e) {
          // ignore read errors for permission restricted folders
        }
      }
    })
    return { success: true, games }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message, games: [] }
  }
})

// ─── Game Launch ─────────────────────────────────────────────────────────────
let runningGameProcess: ChildProcess | null = null

ipcMain.handle('games:launch', async (_event, launchUrl: string) => {
  try {
    if (launchUrl && !launchUrl.includes('://') && launchUrl.endsWith('.exe')) {
      registerGameExe(path.basename(launchUrl), path.basename(launchUrl, '.exe'))
    }

    if (launchUrl.includes('://')) {
      await shell.openExternal(launchUrl)
    } else {
      // Custom .exe path
      runningGameProcess = execFile(launchUrl, (err) => {
        if (err && !err.killed) console.error('Launch error:', err)
        runningGameProcess = null
        setTimeout(() => {
          const detected = getCurrentDetectedGame()
          if (mainWindow && !detected) {
            mainWindow.webContents.send('games:stopped')
          }
        }, 5000)
      })
    }
    return { success: true }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
})

ipcMain.handle('games:stop', async () => {
  if (runningGameProcess) {
    try {
      runningGameProcess.kill()
      runningGameProcess = null
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
  
  // Try to kill via processMonitor detected game
  const detectedGame = getCurrentDetectedGame()
  if (detectedGame && detectedGame.exeName) {
    return new Promise((resolve) => {
      exec(`taskkill /F /IM "${detectedGame.exeName}"`, (err: any) => {
        if (err) {
          console.error('[ProcessMonitor] Kill error:', err.message)
          resolve({ success: false, error: err.message })
        } else {
          console.log(`[ProcessMonitor] Killed ${detectedGame.exeName}`)
          resolve({ success: true })
        }
      })
    })
  }

  return { success: true }
})

// ─── File Dialog ─────────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-exe', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Game Executable',
    filters: [
      { name: 'Executables', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Download Directory',
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── Settings Storage & App Lifecycle ───────────────────────────────────────
ipcMain.handle('app:relaunch', () => {
  app.relaunch()
  app.exit(0)
})

ipcMain.handle('settings:get', () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
    return {}
  } catch {
    return {}
  }
})

ipcMain.handle('settings:set', (_event, data: Record<string, unknown>) => {
  try {
    const existing = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      : {}
    const newSettings = { ...existing, ...data }
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2))
    
    // Live update keybinds if they were changed
    if (data.rlScoreboardKeyKb !== undefined || data.rlScoreboardKeyCtrl !== undefined) {
      const { setInputKeybinds } = require('./inputService')
      setInputKeybinds(newSettings.rlScoreboardKeyKb || 'Tab', newSettings.rlScoreboardKeyCtrl || 'Select')
    }
    
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
})

// ─── Native Notifications ───────────────────────────────────────────────────
function showNativeWindowsToast(title: string, body: string) {
  if (process.platform !== 'win32') return
  try {
    const cleanTitle = (title || 'Eclipse Launcher').replace(/[\r\n\t]/g, ' ')
    const cleanBody = (body || '').replace(/[\r\n\t]/g, ' ')
    const escapeXml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

    const iconCandidates = [
      path.join(__dirname, '../assets/logo.png'),
      path.join(__dirname, '../../assets/logo.png'),
      path.join(process.resourcesPath || '', 'assets/logo.png'),
      path.join(app.getAppPath(), 'src/assets/logo.png'),
    ]
    const iconPath = iconCandidates.find(p => fs.existsSync(p))
    const imageXml = iconPath ? `<image placement="appLogoOverride" hint-crop="circle" src="${escapeXml(iconPath)}"/>` : ''

    const xmlString = `<toast><visual><binding template="ToastGeneric"><text>${escapeXml(cleanTitle)}</text><text>${escapeXml(cleanBody)}</text>${imageXml}</binding></visual></toast>`

    const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('${xmlString.replace(/'/g, "''")}')
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe')
$notifier.Show($toast)
`
    const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`, (err) => {
      if (err) console.error('[WindowsToast] PowerShell toast error:', err)
    })
  } catch (e) {
    console.error('[WindowsToast] Error:', e)
  }
}

ipcMain.handle('notification:show', (_event, { title, body }: { title: string; body: string }) => {
  try {
    if (Notification.isSupported()) {
      const iconCandidates = [
        path.join(__dirname, '../assets/logo.png'),
        path.join(__dirname, '../../assets/logo.png'),
        path.join(process.resourcesPath || '', 'assets/logo.png'),
        path.join(app.getAppPath(), 'src/assets/logo.png')
      ]
      const iconPath = iconCandidates.find(p => fs.existsSync(p))

      const notif = new Notification({
        title: title || 'Eclipse Launcher',
        body: body || '',
        icon: iconPath,
      })

      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
      })

      notif.show()
    }
  } catch (err: any) {
    console.error('[Notification] Error showing native notification:', err)
  }

  // Also trigger Windows Toast notification to ensure 100% visibility in bottom right
  showNativeWindowsToast(title, body)

  return { success: true }
})

// ─── Overlay Edit Mode ────────────────────────────────────────────────────────
ipcMain.handle('overlay:open-edit', () => {
  openOverlayEditMode()
})

ipcMain.handle('overlay:exit-edit', () => {
  exitEditMode()
})

ipcMain.handle('overlay:save-positions', (_event, positions: Record<string, unknown>) => {
  try {
    const existing = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      : {}
    fs.writeFileSync(settingsPath, JSON.stringify({ ...existing, overlayPositions: positions }, null, 2))
    exitEditMode()
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
})


// ─── Cloudflare Bypass Fetch ──────────────────────────────────────────────────
ipcMain.handle('source:fetch-cf', async (_event, url: string) => {
  return new Promise((resolve) => {
    const hiddenWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    hiddenWin.loadURL(url)
    
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      if (attempts > 20) {
        clearInterval(interval)
        hiddenWin.destroy()
        resolve(null)
        return
      }
      try {
        if (!hiddenWin || hiddenWin.isDestroyed()) {
          clearInterval(interval)
          resolve(null)
          return
        }
        const text = await hiddenWin.webContents.executeJavaScript('document.body.innerText')
        if (text && text.includes('"name"') && text.includes('"downloads"')) {
          clearInterval(interval)
          hiddenWin.destroy()
          resolve(text)
        }
      } catch (err) {}
    }, 1000)
  })
})

// ─── Generic Fetch (CORS Bypass) ──────────────────────────────────────────────
ipcMain.handle('util:fetch', async (_event, url: string) => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
})


// ─── RL Playlist IPC ──────────────────────────────────────────────────────────
ipcMain.handle('rl:set-playlist', (_event, playlist: string) => {
  setRLPlaylist(playlist as any)
  return { success: true }
})

ipcMain.handle('rl:set-api-key', (_event, key: string) => {
  setRLApiKey(key)
  return { success: true }
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────
ipcMain.handle('system:open-url', (_event, url: string) => shell.openExternal(url))
ipcMain.handle('open-url', (_event, url: string) => shell.openExternal(url))

ipcMain.handle('system:create-desktop-shortcut', () => {
  try {
    const desktopPath = app.getPath('desktop')
    const shortcutPath = path.join(desktopPath, 'Eclipse Launcher.lnk')
    const targetPath = process.execPath

    const success = shell.writeShortcutLink(shortcutPath, 'create', {
      target: targetPath,
      icon: targetPath,
      iconIndex: 0,
      description: 'Eclipse Launcher'
    })
    return { success }
  } catch (error: any) {
    console.error('Failed to create desktop shortcut:', error)
    return { success: false, error: error?.message || 'Failed' }
  }
})

ipcMain.handle('rl:fetch-steam-avatar', async (_, url: string) => {
  return await fetchSteamAvatar(url)
})

// Friends window IPC
ipcMain.handle('open-friends-window', () => {
  createFriendsWindow()
})

ipcMain.handle('close-friends-window', () => {
  if (friendsWindow) {
    friendsWindow.close()
  }
})

ipcMain.handle('open-add-friend-modal', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('show-add-friend-modal')
  }
})

ipcMain.handle('open-friend-profile-modal', (_, friendId: string) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('show-friend-profile-modal', friendId)
  }
})

app.whenReady().then(() => {
  // Check for old versions and silently uninstall them
  try {
    const localAppData = path.join(app.getPath('appData'), '../Local')
    
    // Manually delete old Squirrel.Windows folder to prevent Update.exe from deleting the new NSIS shortcut
    const squirrelFolder = path.join(localAppData, 'eclipse-launcher')
    if (fs.existsSync(squirrelFolder)) {
      fs.rmSync(squirrelFolder, { recursive: true, force: true })
      console.log('Successfully removed old Squirrel folder')
    }
  } catch (e) {}

  createWindow()
})

app.on('window-all-closed', () => {
  destroyRLScraper()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Discord RPC ─────────────────────────────────────────────────────────────
ipcMain.handle('discord:set-activity', (_event, gameName: string, startTime: number, isPrivacyMode?: boolean) => {
  setDiscordActivity(gameName, startTime, !!isPrivacyMode)
  return { success: true }
})

ipcMain.handle('discord:set-download-activity', (_event, downloadName: string) => {
  const { setDiscordDownloadActivity } = require('./discordRPC')
  setDiscordDownloadActivity(downloadName)
  return { success: true }
})

ipcMain.handle('discord:set-idle-activity', () => {
  setDiscordIdleActivity()
  return { success: true }
})

ipcMain.handle('discord:clear-activity', () => {
  clearDiscordActivity()
  return { success: true }
})

