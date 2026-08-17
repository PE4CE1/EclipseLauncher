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
import { startProcessMonitor, registerGameExe, getCurrentDetectedGame, resetCurrentDetectedGame } from './processMonitor'
import { loadPlaytimeDb, savePlaytimeDb, addPlaytimeRecord } from './playtimeService'
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

// ─── Deep Linking: eclipse:// protocol registration ──────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('eclipse', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('eclipse')
}

let pendingThemeInstall: any = null

async function handleDeepLink(rawUrl: string) {
  try {
    if (!rawUrl || typeof rawUrl !== 'string') return
    const cleanUrl = rawUrl.trim()
    if (!cleanUrl.startsWith('eclipse://')) return

    console.log('[DeepLink] Processing:', cleanUrl)
    // Support URLs like eclipse://install-theme?url=... or eclipse://theme?data=...
    const urlObj = new URL(cleanUrl)
    const action = (urlObj.host || urlObj.pathname.replace(/^\/\//, '')).toLowerCase()

    if (action === 'install-theme' || action === 'theme') {
      const params = urlObj.searchParams
      const themeUrl = params.get('url')
      let name = params.get('name') || 'Custom Theme'
      let author = params.get('author') || 'Eclipse Community'
      let color = params.get('color') || '#ffffff'
      let description = params.get('description') || ''
      let preview = params.get('preview') || ''
      let css = params.get('css') || ''
      const dataBase64 = params.get('data')

      if (dataBase64) {
        try {
          const decoded = JSON.parse(Buffer.from(dataBase64, 'base64').toString('utf-8'))
          if (decoded.css) css = decoded.css
          if (decoded.name) name = decoded.name
          if (decoded.author) author = decoded.author
          if (decoded.color) color = decoded.color
          if (decoded.description) description = decoded.description
          if (decoded.preview) preview = decoded.preview
        } catch {}
      }

      if (!css && themeUrl) {
        try {
          const res = await fetch(themeUrl)
          if (res.ok) {
            css = await res.text()
          }
        } catch (fetchErr) {
          console.error('[DeepLink] Error fetching theme CSS:', fetchErr)
        }
      }

      if (css) {
        const themeObj = {
          id: 'theme_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(),
          name,
          author,
          accentColor: color,
          description,
          previewImage: preview,
          css,
          installedAt: Date.now()
        }

        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
          mainWindow.webContents.send('theme:install-request', themeObj)
        } else {
          pendingThemeInstall = themeObj
        }
      }
    }
  } catch (err) {
    console.error('[DeepLink] Failed to parse deep link URL:', err)
  }
}

// Single Instance Lock for handling deep links on Windows
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    const deepLinkArg = argv.find(arg => arg.startsWith('eclipse://'))
    if (deepLinkArg) {
      handleDeepLink(deepLinkArg)
    }
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

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

    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
        mainWindow.focus()
      }
      if (pendingThemeInstall && mainWindow) {
        mainWindow.webContents.send('theme:install-request', pendingThemeInstall)
        pendingThemeInstall = null
      }
    })

    // Fallback: show the window quickly regardless
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
        mainWindow.focus()
      }
    }, 1500)
  }

  const indexPath = path.join(__dirname, '../dist/index.html')
  const devUrl = process.env['VITE_DEV_SERVER_URL']

  if (devUrl) {
    console.log(`[MainWindow] Loading Vite Dev Server: ${devUrl}`)
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else if (fs.existsSync(indexPath)) {
    console.log(`[MainWindow] Loading local build: ${indexPath}`)
    mainWindow.loadFile(indexPath)
  } else {
    console.log(`[MainWindow] Fallback to localhost:5173`)
    mainWindow.loadURL('http://127.0.0.1:5173/')
  }

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
    console.warn(`[MainWindow] did-fail-load: ${validatedURL} (${errorCode} - ${errorDesc})`)
    if (fs.existsSync(indexPath) && validatedURL.startsWith('http')) {
      console.log(`[MainWindow] Falling back immediately to local build bundle: ${indexPath}`)
      mainWindow?.loadFile(indexPath).catch(() => {})
    }
  })

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

function createFriendsWindow() {
  if (friendsWindow && !friendsWindow.isDestroyed()) {
    if (friendsWindow.isMinimized()) friendsWindow.restore()
    friendsWindow.show()
    friendsWindow.focus()
    return
  }

  friendsWindow = new BrowserWindow({
    width: 340,
    height: 540,
    minWidth: 320,
    minHeight: 500,
    resizable: true,
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

  const devUrl = process.env['VITE_DEV_SERVER_URL']
  const indexPath = path.join(__dirname, '../dist/index.html')

  if (devUrl) {
    friendsWindow.loadURL(`${devUrl}#friends`)
  } else if (fs.existsSync(indexPath)) {
    friendsWindow.loadURL(`file://${indexPath}#friends`)
  } else {
    friendsWindow.loadURL('http://127.0.0.1:5173/#friends')
  }

  friendsWindow.once('ready-to-show', () => {
    friendsWindow?.show()
    friendsWindow?.focus()
  })

  friendsWindow.on('closed', () => {
    friendsWindow = null
  })
}

// ─── Friends Window IPC Handlers ──────────────────────────────────────────────
ipcMain.handle('open-friends-window', () => {
  createFriendsWindow()
  return { success: true }
})

ipcMain.handle('close-friends-window', () => {
  if (friendsWindow && !friendsWindow.isDestroyed()) {
    friendsWindow.close()
  }
  return { success: true }
})

ipcMain.handle('open-add-friend-modal', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('show-add-friend-modal')
  }
  return { success: true }
})

ipcMain.handle('open-friend-profile-modal', (_event, friendId: string) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('show-friend-profile-modal', friendId)
  }
  return { success: true }
})

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
  try {
    if (runningGameProcess) {
      try {
        runningGameProcess.kill()
      } catch {}
      runningGameProcess = null
    }
    
    // Kill via processMonitor detected game
    const detectedGame = getCurrentDetectedGame()
    if (detectedGame && detectedGame.exeName) {
      exec(`taskkill /F /IM "${detectedGame.exeName}"`, (err: any) => {
        if (err) console.warn('[ProcessMonitor] Taskkill error:', err.message)
      })
    }

    resetCurrentDetectedGame()
    mainWindow?.webContents.send('games:stopped')
    return { success: true }
  } catch (err: any) {
    mainWindow?.webContents.send('games:stopped')
    return { success: false, error: err.message }
  }
})

// ─── Playtime Persistence IPC ───────────────────────────────────────────────
ipcMain.handle('playtime:get', async () => {
  try {
    return loadPlaytimeDb()
  } catch (e: any) {
    return {}
  }
})

ipcMain.handle('playtime:save', async (_event, db: any) => {
  try {
    return savePlaytimeDb(db)
  } catch (e: any) {
    return false
  }
})

ipcMain.handle('playtime:add', async (_event, payload: { gameIdOrName: string; name?: string; minutes: number; steamId?: number }) => {
  try {
    return addPlaytimeRecord(payload.gameIdOrName, payload.name || payload.gameIdOrName, payload.minutes, payload.steamId)
  } catch (e: any) {
    return {}
  }
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

// ─── VPN Service IPC ────────────────────────────────────────────────────────
import { detectInstalledVpns, getVpnStatus, connectVpn, disconnectVpn } from './vpnService'

ipcMain.handle('vpn:detect', async () => {
  try {
    return await detectInstalledVpns()
  } catch (e: any) {
    return []
  }
})

ipcMain.handle('vpn:status', async () => {
  try {
    return await getVpnStatus()
  } catch (e: any) {
    return { isConnected: false }
  }
})

ipcMain.handle('vpn:connect', async (_event, vpnId?: string) => {
  try {
    return await connectVpn(vpnId)
  } catch (e: any) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('vpn:disconnect', async (_event, vpnId?: string) => {
  try {
    return await disconnectVpn(vpnId)
  } catch (e: any) {
    return { success: false, message: e.message }
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


// ─── Cloudflare Turnstile Bypass Source Fetcher ──────────────────────────────
ipcMain.handle('source:fetch-cf', async (_event, rawUrl: string) => {
  const targetUrl = rawUrl.trim()
  return new Promise((resolve) => {
    let resolved = false
    let hiddenWin: BrowserWindow | null = new BrowserWindow({
      show: false,
      width: 1000,
      height: 800,
      webPreferences: { 
        nodeIntegration: false, 
        contextIsolation: true,
        sandbox: true 
      }
    })

    const cleanup = () => {
      if (hiddenWin && !hiddenWin.isDestroyed()) {
        try { hiddenWin.destroy() } catch {}
        hiddenWin = null
      }
    }

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(null)
      }
    }, 20000)

    let pollInterval: NodeJS.Timeout | null = null

    const startPolling = () => {
      if (pollInterval) return
      pollInterval = setInterval(async () => {
        if (resolved || !hiddenWin || hiddenWin.isDestroyed()) {
          if (pollInterval) clearInterval(pollInterval)
          return
        }
        try {
          const content = await hiddenWin.webContents.executeJavaScript('document.querySelector("pre")?.textContent || document.body.innerText').catch(() => '')
          if (content && (content.startsWith('{') || content.includes('"downloads"')) && content.length > 50) {
            resolved = true
            if (pollInterval) clearInterval(pollInterval)
            clearTimeout(timer)
            cleanup()
            resolve(content)
          }
        } catch {}
      }, 500)
    }

    hiddenWin.webContents.on('did-finish-load', () => {
      startPolling()
    })

    hiddenWin.loadURL(targetUrl).catch(() => {
      if (!resolved) {
        resolved = true
        if (pollInterval) clearInterval(pollInterval)
        clearTimeout(timer)
        cleanup()
        resolve(null)
      }
    })
  })
})

// ─── Generic Fetch (CORS Bypass) ──────────────────────────────────────────────
ipcMain.handle('util:fetch', async (_event, url: string) => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    })
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

ipcMain.handle('debrid:test-key', async (_event, { provider, apiKey }: { provider: string; apiKey: string }) => {
  try {
    if (provider === 'realDebrid') {
      const res = await fetch('https://api.real-debrid.com/rest/1.0/user', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (res.ok) {
        const user = await res.json()
        return { success: true, username: user.username, type: user.type, expiration: user.expiration }
      }
      return { success: false, error: 'Ungültiger Real-Debrid API Key' }
    } else if (provider === 'torbox') {
      const res = await fetch('https://api.torbox.app/v1/api/user/me', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (res.ok) {
        const user = await res.json()
        return { success: true, username: user?.data?.email || 'TorBox User' }
      }
      return { success: false, error: 'Ungültiger TorBox API Key' }
    }
    return { success: false, error: 'Unbekannter Provider' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

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

  // Check initial startup deep link argument
  const initialDeepLink = process.argv.find(arg => arg.startsWith('eclipse://'))
  if (initialDeepLink) {
    handleDeepLink(initialDeepLink)
  }
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

