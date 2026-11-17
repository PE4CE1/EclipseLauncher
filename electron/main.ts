import { app, BrowserWindow, dialog, shell, Tray, Menu, nativeImage, Notification, protocol, session, globalShortcut } from 'electron'
import { PerformanceOverlayHotkey } from './performanceHotkey'
import { buildOverlayData } from './overlayState'
import { CROSSHAIR_GAMES, isCrosshairGameId } from '../src/services/gameCrosshairs'
import { ipcMain, secureAppWindow } from './ipcSecurity'
import { isAllowedExternalUrl, isHttpUrl } from './securityPolicy'
import { initNetworkIPC, requestText } from './networkService'
import { initClipboardIPC } from './clipboardService'
import { initGameFpsIPC } from './fpsAccessIPC'
import { shutdownGameFpsAccess } from './gameFpsService'
import { writeJsonAtomicSync } from './jsonStorage'
import { createAutoLaunchSettings, commitStartupSettings, isAutoStart, shouldStartHidden as startupHidden } from './autoLaunchSettings'
import { cleanupLegacyAutoLaunch } from './legacyAutoLaunch'
import { bindMainWindowLifecycle, mainWindowState } from './mainWindowLifecycle'
import { withoutRetiredSettings } from '../src/services/retiredSettings'
import { withKeyforsteamDefaults } from '../src/services/keyforsteamDefaults'
import { releaseInheritedMemoryLimits } from './legacyMemoryJob'
import { openExternalApplication, openExternalPath, relaunchOutsideMemoryJob, bindExternalLaunchShutdown, type LaunchedProcess } from './externalLaunch'
import { launchExecutable, launchRiotGame } from './gameLaunchService'
import { ASSET_SCHEME, initAssetProtocol } from './assetProtocol'
import { attachRendererLogging } from './rendererLogging'
import { showDesktopNotification } from './nativeNotifications'
import { initRendererPermissions } from './rendererPermissions'
import { disableChromiumWindowAnimations } from './overlayWindowEffects'
import { serveLocalMedia } from './localMediaProtocol'
import { friendsWindowOptions, createAddFriendReveal } from './friendsWindowPolicy'
import { registerSocialStateRelay } from './socialStateRelay'
import { registerChatWindowIPC } from './chatWindowIPC'

if (require('electron-squirrel-startup')) {
  app.quit()
}
bindExternalLaunchShutdown(app)

// Global exception logging to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason)
})

import { execFile } from 'child_process'

import path from 'path'
import fs from 'fs'
import { scanGames } from './scanner'
import { normalizeAppMode } from '../src/services/appMode'
import { setProcessMonitorMode } from './processMonitor'
import { beginModeSwitch, cancelModeSwitch } from './operationBarrier'
let stopTorrentDownloads = () => {}, stopHttpDownloads = () => {}
let hasDownloadWork = () => false
import { initUpdater } from './updaterService'
import { initDiscordRPC, stopDiscordRPC } from './discordRPC'
import { startProcessMonitor, stopProcessMonitor, registerGameExe, registerInstalledGameRecords, getCurrentDetectedGame, getCurrentDetectedGamePid, getLastActiveRobloxExperience, syncDiscordPresence, setLauncherDownloadActivity, resetCurrentDetectedGame, invalidateSettingsCache, syncOverlaySettingsLive, isAnyGameRunning, updateSettingsInMemory } from './processMonitor'
import { loadPlaytimeDb, savePlaytimeDb, addPlaytimeRecord, getDeduplicatedRecentGames, RecentGameItem } from './playtimeService'
import { initOverlayManager, openOverlayEditMode, exitEditMode, getOverlayWindow } from './overlayManager'
import { initStreamManager } from './streamManager'
import { setRLPlaylist, stopRLService, resetRLSession, extractPlayerFromLog, getRLState } from './rlService'
import { fetchSteamAvatar } from './steamService'
import { startInputService, stopInputService, setInputKeybinds } from './inputService'
import { detectHardwareSpecs } from './hardwareService'
import { initClipsIPC, loadClipSettings } from './clipService'
import { initVoiceIPC, stopVoiceListener } from './voiceService'
import { flushSystemRam } from './boostService'
import { initAutoClipService, refreshAutoClipSettings } from './autoClipService'
import { cs2Session } from './cs2Stats'
import { getAllCachedSources, getCachedSource, fetchAndCacheSource, removeCachedSource, clearCachedSources, saveCachedSource } from './sourceFetcherService'
import { initMediaIPC, registerMediaGlobalHotkeys, unregisterAllMediaHotkeys } from './mediaService'
import { initStorageIPC } from './storageService'
import { initSpicetifyIPC } from './spicetifyService'
import { initVencordIPC } from './vencordService'
import { initMillenniumIPC } from './millenniumService'
import { initOpenAsarIPC } from './openasarService'
import { initRobloxIPC } from './robloxService'
import { startMemoryOptimizer, stopMemoryOptimizer, trimMemoryNow, requestMemoryRelief } from './memoryOptimizerService'
import { initAccountPersistenceIPC, savePersistentIdentity } from './accountPersistenceService'
import { startFreeGamesRadar, stopFreeGamesRadar, checkFreeGames, getCachedFreeGames, configureFreeGameNotifications, FreeGameItem } from './freeGamesService'
import { initControllerBatteryService } from './controllerBatteryService'
import { initGamepadIPC, stopGamepadService } from './gamepadService'

// Register privileged scheme for local clips video playback
protocol.registerSchemesAsPrivileged([
  ASSET_SCHEME,
  {
    scheme: 'local-media',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

// Normalize Vite dev server URL to IPv4 127.0.0.1 to avoid Windows IPv6 localhost connection timeout
if (process.env['VITE_DEV_SERVER_URL']) {
  process.env['VITE_DEV_SERVER_URL'] = process.env['VITE_DEV_SERVER_URL'].replace('://localhost:', '://127.0.0.1:')
}

// vite-plugin-electron sets this in dev mode
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isDev = !!DEV_SERVER_URL || !app.isPackaged
if (isDev) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
}

app.name = 'Eclipse Launcher'
if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.eclipse.launcher' : process.execPath)
} else {
  app.setAppUserModelId('Eclipse Launcher')
}
app.setPath('userData', path.join(app.getPath('appData'), 'GameHub'))

// ─── Memory & Engine Optimization Flags ──────────────────────────────────────
app.commandLine.appendSwitch('js-flags', '--expose-gc')
disableChromiumWindowAnimations()
// Disk storage, not a RAM reservation: retain large libraries' compressed posters
// alongside catalogue images instead of constantly evicting them.
app.commandLine.appendSwitch('disk-cache-size', '134217728')
app.commandLine.appendSwitch('media-cache-size', '16777216')
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// ─── Deep Linking: eclipse:// protocol registration ──────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('eclipse', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('eclipse')
}

async function openAllowedExternal(url: string): Promise<void> {
  if (!isAllowedExternalUrl(url)) throw new Error('Unsupported external URL')
  await openExternalApplication(url)
}

let pendingThemeInstall: any = null

async function handleDeepLink(rawUrl: string) {
  try {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 2 * 1024 * 1024) return
    let cleanUrl = rawUrl.trim().replace(/^["']|["']$/g, '')
    if (!cleanUrl.toLowerCase().includes('eclipse:')) return

    // Extract exact eclipse:... substring
    const match = cleanUrl.match(/eclipse:[^\s"']+/i)
    if (match) {
      cleanUrl = match[0]
    }

    console.log('[DeepLink] Processing:', cleanUrl)

    // Normalize protocol to double slash if missing (e.g. eclipse:install-theme -> eclipse://install-theme)
    if (cleanUrl.startsWith('eclipse:') && !cleanUrl.startsWith('eclipse://')) {
      cleanUrl = cleanUrl.replace(/^eclipse:\/?\/?/i, 'eclipse://')
    }

    const urlObj = new URL(cleanUrl)
    const rawPath = (urlObj.host + urlObj.pathname).toLowerCase().replace(/^\/+|\/+$/g, '')

    const params = urlObj.searchParams
    let themeUrl = params.get('url') || params.get('themeUrl') || params.get('cssUrl')
    let name = params.get('name') || params.get('title') || 'Custom Theme'
    let author = params.get('author') || params.get('by') || 'Eclipse Community'
    let color = params.get('color') || params.get('accentColor') || '#ffffff'
    let description = params.get('description') || params.get('desc') || ''
    let preview = params.get('preview') || params.get('previewImage') || ''
    let css = params.get('css') || ''
    const dataBase64 = params.get('data') || params.get('theme')

    if (dataBase64) {
      try {
        const decoded = JSON.parse(Buffer.from(dataBase64, 'base64').toString('utf-8'))
        if (decoded.css) css = decoded.css
        if (decoded.name) name = decoded.name
        if (decoded.author) author = decoded.author
        if (decoded.color || decoded.accentColor) color = decoded.color || decoded.accentColor
        if (decoded.description) description = decoded.description
        if (decoded.preview || decoded.previewImage) preview = decoded.preview || decoded.previewImage
      } catch (e) {
        console.warn('[DeepLink] Could not parse base64 data:', e)
      }
    }

    if (!css && themeUrl) {
      try {
        // Automatically convert GitHub blob URLs to raw.githubusercontent.com
        if (themeUrl.includes('github.com') && themeUrl.includes('/blob/')) {
          themeUrl = themeUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
        }
        console.log('[DeepLink] Fetching CSS from:', themeUrl)
        if (!isHttpUrl(themeUrl)) throw new Error('Theme URL must use HTTP(S)')
        const res = await requestText({ id: 'theme-fetch', url: themeUrl,
          headers: { 'User-Agent': 'Eclipse-Launcher-Client' }
        })
        if (res.status >= 200 && res.status < 300) {
          css = res.body
        } else {
          console.warn('[DeepLink] Fetch failed with HTTP status:', res.status)
        }
      } catch (fetchErr) {
        console.error('[DeepLink] Error fetching theme CSS from URL:', fetchErr)
      }

      // Local disk fallback (for dev mode or offline)
      if (!css) {
        const themeFileName = path.basename(themeUrl.split('?')[0])
        const candidatePaths = [
          path.join(__dirname, '../themes', themeFileName),
          path.join(__dirname, '../../themes', themeFileName),
          path.join(app.getAppPath(), 'themes', themeFileName),
          path.join(process.cwd(), 'themes', themeFileName)
        ]
        for (const cp of candidatePaths) {
          if (fs.existsSync(cp)) {
            css = fs.readFileSync(cp, 'utf-8')
            console.log('[DeepLink] Loaded theme CSS from local disk:', cp)
            break
          }
        }
      }
    }

    if (typeof css === 'string' && css && css.length <= 1024 * 1024) {
      const safeDecode = (str: string | null | undefined): string => {
        if (typeof str !== 'string') return ''
        try {
          return decodeURIComponent(str)
        } catch {
          return str
        }
      }

      const finalName = safeDecode(name) || name || 'Custom Theme'
      const finalAuthor = safeDecode(author) || author || 'Eclipse Community'
      const finalDesc = safeDecode(description) || description || ''

      const themeObj = {
        id: 'theme_' + finalName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(),
        name: finalName,
        author: finalAuthor,
        accentColor: color || '#ffffff',
        description: finalDesc,
        previewImage: preview || '',
        css,
        installedAt: Date.now()
      }

      console.log('[DeepLink] Theme successfully constructed:', themeObj.name)
      pendingThemeInstall = themeObj

      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('theme:install-request', themeObj)
        // Multi-stage retry in case React is still rendering
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('theme:install-request', themeObj)
          }
        }, 400)
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('theme:install-request', themeObj)
          }
        }, 1000)
      }
    } else {
      console.warn('[DeepLink] No CSS could be retrieved for theme!')
    }
  } catch (err) {
    console.error('[DeepLink] Failed to parse deep link URL:', err)
  }
}

ipcMain.handle('theme:get-pending', () => {
  const p = pendingThemeInstall
  pendingThemeInstall = null
  return p
})

ipcMain.handle('system:get-hardware-specs', async () => {
  try {
    return await detectHardwareSpecs()
  } catch (e) {
    console.warn('[HardwareService] Error detecting specs:', e)
    return null
  }
})

ipcMain.handle('boost:manual-flush', async () => {
  try {
    return await flushSystemRam()
  } catch (e) {
    console.error('[TrueBoost] Manual flush error:', e)
    return { freedMB: 0, currentFreeGB: '0' }
  }
})

// Single Instance Lock for handling deep links on Windows
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  if (isDev) {
    console.warn('[Main] Another instance is already running or holding the lock. Focusing existing instance and exiting.')
  }
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', (_event, argv) => {
    if (!isAutoStart(argv) || argv.some(arg => arg.toLowerCase().startsWith('eclipse:'))) restoreAndFocusMainWindow()
    const deepLinkArg = argv.find(arg => arg.toLowerCase().includes('eclipse:'))
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
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      const parsed = withKeyforsteamDefaults(withoutRetiredSettings(saved))
      if (parsed !== saved) {
        try { writeJsonAtomicSync(settingsPath, parsed) }
        catch (error) { console.warn('[Settings] Could not persist preference migration:', error) }
      }
      if (!parsed.exitInsteadOfMinimizeMigrated_v1_3_0) {
        parsed.exitInsteadOfMinimize = false
        parsed.exitInsteadOfMinimizeMigrated_v1_3_0 = true
        try {
          writeJsonAtomicSync(settingsPath, parsed)
        } catch {}
      }
      return parsed
    }
  } catch {}
  return withKeyforsteamDefaults({ exitInsteadOfMinimize: false, exitInsteadOfMinimizeMigrated_v1_3_0: true })
}

// Check hardware acceleration setting on launch (Default: true)
const startupSettings = getSavedSettings()
const runtimeAppMode = normalizeAppMode(startupSettings.appMode)
if (startupSettings.hardwareAcceleration === false) {
  app.disableHardwareAcceleration()
}

// Enable Web Speech API and experimental features
app.commandLine.appendSwitch('enable-speech-dispatcher')

// Enable background gamepad polling so gamepads work when games are focused
app.commandLine.appendSwitch('enable-gamepad-background-polling')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null
let mainLifecycle: ReturnType<typeof bindMainWindowLifecycle> | null = null
const autoLaunchSettings = createAutoLaunchSettings(app, process.execPath)
let friendsWindow: BrowserWindow | null = null
const addFriendReveal = createAddFriendReveal(() => mainWindow)
let tray: Tray | null = null
let isQuitting = false

function getAppIconPath(): string {
  const candidates = [
    path.join(process.cwd(), 'public/eclipselauncher.png'),
    path.join(__dirname, '../public/eclipselauncher.png'),
    path.join(app.getAppPath(), 'public/eclipselauncher.png'),
    path.join(app.getAppPath(), 'dist/eclipselauncher.png'),
    path.join(__dirname, 'eclipselauncher.png'),
    path.join(process.cwd(), 'public/logo.png'),
    path.join(process.cwd(), 'eclipselauncherlogo.png'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

export function restoreAndFocusMainWindow() {
  mainLifecycle?.reveal()
}

export function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return

  // 1. Zuletzt gespielt (sauber dedupliziert mit Launcher-Anzeige)
  const recentGames = getDeduplicatedRecentGames(6)
  const recentMenuItems: Electron.MenuItemConstructorOptions[] = []

  if (recentGames.length > 0) {
    recentGames.forEach(game => {
      const platformTag = game.platform && game.platform !== 'Game' ? `[${game.platform}] ` : ''
      recentMenuItems.push({
        label: `▶ ${platformTag}${game.displayName}`,
        click: () => {
          if (game.launchUrl) {
            if (game.launchUrl.startsWith('eclipse-game:')) void launchRiotGame(game.launchUrl).catch(() => {})
            else openAllowedExternal(game.launchUrl).catch(() => {})
          } else if (game.placeId) {
            openAllowedExternal(`roblox://experiences/start?placeId=${game.placeId}`).catch(() => {})
          } else if (game.steamId) {
            openAllowedExternal(`steam://rungameid/${game.steamId}`).catch(() => {})
          } else if (game.platform === 'Roblox') {
            openAllowedExternal('roblox://').catch(() => {})
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('tray:launch-game', {
              name: game.name,
              displayName: game.displayName,
              platform: game.platform,
              steamId: game.steamId,
              placeId: game.placeId
            })
          }
        }
      })
    })
  } else {
    recentMenuItems.push({
      label: 'No recently played games',
      enabled: false
    })
  }

  // 2. Free Games Radar (Steam & Epic Games)
  const freeGames = getCachedFreeGames()
  const freeGamesMenuItems: Electron.MenuItemConstructorOptions[] = []

  if (freeGames.length > 0) {
    freeGames.forEach(fg => {
      const priceText = fg.originalPrice ? ` (${fg.originalPrice})` : ''
      freeGamesMenuItems.push({
        label: `🎁 [${fg.platform}] ${fg.title}${priceText}`,
        click: async () => {
          // Open directly in desktop client program (Steam or Epic Games Launcher)
          if (fg.clientUrl) {
            try {
              await openAllowedExternal(fg.clientUrl)
              return
            } catch {}
          }
          if (fg.url) {
            await openAllowedExternal(fg.url).catch(() => {})
          }
        }
      })
    })
    freeGamesMenuItems.push({ type: 'separator' })
    freeGamesMenuItems.push({
      label: '🌐 Open All on Website',
      click: () => {
        freeGames.forEach(fg => {
          if (fg.url) openAllowedExternal(fg.url).catch(() => {})
        })
      }
    })
  } else {
    freeGamesMenuItems.push({
      label: 'No active free games found',
      enabled: false
    })
  }

  freeGamesMenuItems.push({
    label: '🔄 Check for Free Games Now',
    click: async () => {
      await checkFreeGames(true)
      updateTrayMenu()
    }
  })

  // 3. Kontextmenü aufbauen (English as requested)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🎮 Recently Played',
      visible: runtimeAppMode === 'launcher',
      submenu: recentMenuItems
    },
    {
      label: `🎁 Free Games (${freeGames.length})`,
      visible: runtimeAppMode === 'launcher',
      submenu: freeGamesMenuItems
    },
    { type: 'separator' },
    {
      label: '⚡ Clean RAM Now',
      click: async () => {
        try {
          await trimMemoryNow(true)
          if (Notification.isSupported()) {
            const notif = new Notification({
              title: 'Eclipse RAM Booster',
              body: 'Memory successfully optimized!',
              silent: false
            })
            notif.show()
          }
        } catch {}
      }
    },
    { type: 'separator' },
    {
      label: '🪟 Open Eclipse Launcher',
      click: () => {
        restoreAndFocusMainWindow()
      }
    },
    {
      label: '❌ Exit Eclipse',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function createSystemTray() {
  if (tray && !tray.isDestroyed()) return

  const iconPath = getAppIconPath()
  let img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  if (!img.isEmpty()) {
    img = img.resize({ width: 16, height: 16 })
  }

  tray = new Tray(img)
  tray.setToolTip('Eclipse Launcher')
  updateTrayMenu()

  // Single click restores & focuses window on Windows!
  tray.on('click', () => {
    restoreAndFocusMainWindow()
  })

  tray.on('double-click', () => {
    restoreAndFocusMainWindow()
  })

  tray.on('right-click', () => {
    updateTrayMenu()
  })
}

async function createWindow() {
  setProcessMonitorMode(runtimeAppMode)
  const downloads = runtimeAppMode === 'launcher' ? await Promise.all([import('./torrentService'), import('./httpDownloadService')]) : null
  if (downloads) {
    stopTorrentDownloads = downloads[0].stopTorrentDownloads
    stopHttpDownloads = downloads[1].stopHttpDownloads
    hasDownloadWork = () => downloads[0].hasTorrentDownloadWork() || downloads[1].hasHttpDownloadWork()
  }
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
      additionalArguments: runtimeAppMode === 'clips' ? ['--eclipse-clips-mode'] : [],
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
    icon: fs.existsSync(getAppIconPath()) ? getAppIconPath() : undefined,
  })

  secureAppWindow(mainWindow)
  mainWindow.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward') {
      e.preventDefault()
      mainWindow?.webContents.send('navigation:back')
    } else if (cmd === 'browser-forward') {
      e.preventDefault()
      mainWindow?.webContents.send('navigation:forward')
    }
  })

  void cleanupLegacyAutoLaunch(process.execPath, app.getPath('userData'))
    .catch(error => { console.warn('[Startup] Could not clean legacy entries:', error) })
    .then(() => {
      const latest = inMemorySettings || settings
      try { autoLaunchSettings.reconcile(latest.startOnBoot !== false, latest.startMinimized === true) }
      catch (error) { console.warn('[Startup] Could not apply Windows startup settings:', error) }
    })
  const shouldStartHidden = startupHidden(app.isPackaged, process.argv, settings.startMinimized === true)
  mainLifecycle = bindMainWindowLifecycle(mainWindow, shouldStartHidden, async () => { await requestMemoryRelief(true); return false })

  // Always create system tray icon so Eclipse is present in the notification area
  createSystemTray()

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    const s = getSavedSettings()
    if (isDev || s.exitInsteadOfMinimize) {
      isQuitting = true
      app.quit()
      return
    }

    event.preventDefault()
    mainWindow?.hide()
    updateTrayMenu()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingThemeInstall && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:install-request', pendingThemeInstall)
      pendingThemeInstall = null
    }
  })

  const indexPath = path.join(__dirname, '../dist/index.html')
  const devUrl = process.env['VITE_DEV_SERVER_URL']

  // Register did-fail-load before loading to intercept any network errors immediately
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
    console.warn(`[MainWindow] did-fail-load: ${validatedURL} (${errorCode} - ${errorDesc})`)
    if (fs.existsSync(indexPath) && validatedURL.startsWith('http')) {
      console.log(`[MainWindow] Falling back immediately to local build bundle: ${indexPath}`)
      mainWindow?.loadFile(indexPath).catch((err) => console.error('[MainWindow] Fallback loadFile error:', err))
    }
  })

  if (devUrl) {
    console.log(`[MainWindow] Loading Vite Dev Server: ${devUrl}`)
    mainWindow.loadURL(devUrl).catch((err) => {
      console.warn(`[MainWindow] Dev server loadURL('${devUrl}') failed:`, err?.message || err)
      if (fs.existsSync(indexPath)) {
        console.log(`[MainWindow] Falling back to local build bundle: ${indexPath}`)
        mainWindow?.loadFile(indexPath).catch(() => {})
      }
    })
    try {
      if (process.env.ECLIPSE_DEVTOOLS === '1')
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    } catch {}
  } else if (fs.existsSync(indexPath)) {
    console.log(`[MainWindow] Loading local build: ${indexPath}`)
    mainWindow.loadFile(indexPath).catch(() => {})
  } else {
    console.log(`[MainWindow] Fallback to 127.0.0.1:5173`)
    mainWindow.loadURL('http://127.0.0.1:5173/').catch(() => {})
  }


  mainWindow.on('closed', () => {
    mainWindow = null
    isQuitting = true
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.destroy()
        }
      } catch {}
    }
    app.quit()
  })

  // Initialize IPC services
  initNetworkIPC()
  initClipboardIPC()
  initGameFpsIPC()
  initAccountPersistenceIPC()
  downloads?.[0].initTorrentIPC(ipcMain, mainWindow)
  downloads?.[1].initHttpDownloadIPC(ipcMain, mainWindow)
  
  // Initialize Auto Updater
  initUpdater(mainWindow)
  
  // Initialize Discord RPC
  initDiscordRPC()

  // Initialize Overlay IPC
  initOverlayManager(devUrl || 'http://127.0.0.1:5173', runtimeAppMode)
  app.once('will-quit',()=>performanceHotkey.stop())

  // Initialize Media Service (Spotify, YouTube, etc.)
  const getMediaWindows = () => {
    const wins: BrowserWindow[] = []
    if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
    const overlayWin = getOverlayWindow()
    if (overlayWin && !overlayWin.isDestroyed()) wins.push(overlayWin)
    return wins
  }
  if (runtimeAppMode === 'launcher') initMediaIPC(getMediaWindows)

  // Register saved media global hotkeys on startup
  try {
    const startupSettings = getSavedSettings()
    if (runtimeAppMode === 'launcher' && startupSettings?.overlayMediaKeybinds) {
      registerMediaGlobalHotkeys(startupSettings.overlayMediaKeybinds, getMediaWindows, startupSettings.overlayMediaSource)
    }
  } catch (err) {
    console.warn('[Main] Error registering media hotkeys on startup:', err)
  }

  // Initialize Storage & Disk Space Manager
  if (runtimeAppMode === 'launcher') {
  initStorageIPC()

  // Initialize Spicetify Plugin & Extension Manager
  initSpicetifyIPC(() => {
    const wins: BrowserWindow[] = []
    if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
    return wins
  })

  // Initialize Vencord Discord Client Mod Manager
  initVencordIPC(() => {
    const wins: BrowserWindow[] = []
    if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
    return wins
  })

  // Initialize Millennium Steam Client Mod Manager
  initMillenniumIPC(() => {
    const wins: BrowserWindow[] = []
    if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
    return wins
  })

  // Initialize OpenAsar Discord Performance Booster
  initOpenAsarIPC(() => {
    const wins: BrowserWindow[] = []
    if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
    return wins
  })

  // Initialize Roblox Auto-Codes & Live Game Tracker IPC
  initRobloxIPC(() => {
    const wins: BrowserWindow[] = []
    if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
    return wins
  })
  }

  // Initialize Clips Studio IPC & Global Hotkey
  initClipsIPC(mainWindow)
  if(runtimeAppMode==='launcher')try{performanceHotkey.apply(getSavedSettings().overlayPerformanceHotkey)}catch(error){console.warn('[Main] Performance shortcut registration failed:',error)}
  initVoiceIPC(() => mainWindow)
  initAutoClipService(() => mainWindow, loadClipSettings,()=>runtimeAppMode==='launcher'&&getSavedSettings().overlayCS2Stats===true,()=>getOverlayWindow()?.webContents.send('cs2:stats',cs2Session.read()))
  if (runtimeAppMode === 'launcher') {
    initStreamManager()
    initControllerBatteryService()
    initGamepadIPC()
  }

  // Steam manifests and executable discovery must not delay the first window paint.
  const monitorWindow = mainWindow
  const monitorStart = setTimeout(() => {
    if (!isQuitting && monitorWindow && !monitorWindow.isDestroyed()) startProcessMonitor(() => mainWindow)
  }, 1500)
  monitorStart.unref()
  mainWindow.once('closed', () => clearTimeout(monitorStart))

  // Start automated background RAM optimizer
  startMemoryOptimizer(() => mainWindow)

  // Start background Free Games Radar (Steam & Epic Games)
  configureFreeGameNotifications({
    updated: () => { updateTrayMenu(); mainWindow?.webContents.send('freegames:updated') },
    open: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('freegames:open')
    },
  })
  if (runtimeAppMode === 'launcher') startFreeGamesRadar()
}

function createFriendsWindow() {
  if (friendsWindow && !friendsWindow.isDestroyed()) {
    if (friendsWindow.isMinimized()) friendsWindow.restore()
    friendsWindow.show()
    friendsWindow.focus()
    return
  }

  const friendsOptions = friendsWindowOptions(path.join(__dirname, 'preload.js'), fs.existsSync(getAppIconPath()) ? getAppIconPath() : undefined)
  friendsWindow = new BrowserWindow({ ...friendsOptions, webPreferences: { ...friendsOptions.webPreferences, additionalArguments: runtimeAppMode === 'clips' ? ['--eclipse-clips-mode'] : [] } })

  secureAppWindow(friendsWindow)
  const devUrl = process.env['VITE_DEV_SERVER_URL']
  const indexPath = path.join(__dirname, '../dist/index.html')

  if (devUrl) {
    friendsWindow.loadURL(`${devUrl}#friends`)
  } else if (fs.existsSync(indexPath)) {
    friendsWindow.loadFile(indexPath, { hash: 'friends' })
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
registerSocialStateRelay(ipcMain,
  () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : undefined,
  () => friendsWindow && !friendsWindow.isDestroyed() ? friendsWindow.webContents : undefined)
const chatWindow = registerChatWindowIPC(ipcMain, {
  owner: () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : undefined,
  friends: () => friendsWindow && !friendsWindow.isDestroyed() ? friendsWindow.webContents : undefined,
  open: () => createFriendsWindow(),
  uid: () => getSavedSettings().userUid || '',
  loadMuted: () => getSavedSettings().chatMutedFriends || {},
  saveMuted: async value => (await saveSettingsPatch({ chatMutedFriends: value })).success === true,
})

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

// ─── Steam Monitor Floating Desktop Window ──────────────────────────────────
let steamMonitorWindow: BrowserWindow | null = null
let steamMonitorAlwaysOnTop = true
let steamMonitorWatchdog: NodeJS.Timeout | null = null

export function enforceSteamMonitorTopmost() {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed() && steamMonitorAlwaysOnTop) {
    try {
      steamMonitorWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    } catch {}
  }
}

export function bringSteamMonitorToForeground(): boolean {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    try {
      if (steamMonitorWindow.isMinimized()) {
        steamMonitorWindow.restore()
      }
      steamMonitorWindow.show()
      steamMonitorWindow.setAlwaysOnTop(steamMonitorAlwaysOnTop, 'screen-saver', 1)
      steamMonitorWindow.moveTop()
      steamMonitorWindow.focus()
      return true
    } catch {}
  }
  return false
}

export function createSteamMonitorWindow() {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    bringSteamMonitorToForeground()
    return
  }

  steamMonitorWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 380,
    minHeight: 460,
    resizable: true,
    frame: false,
    transparent: true,
    alwaysOnTop: steamMonitorAlwaysOnTop,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    show: false,
    skipTaskbar: false,
    title: 'Steam Traffic & Rate-Limit Inspector',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
    icon: fs.existsSync(getAppIconPath()) ? getAppIconPath() : undefined,
  })

  secureAppWindow(steamMonitorWindow)
  // Ensure window stays visible across all virtual workspaces and full-screen games/apps
  try {
    steamMonitorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    steamMonitorWindow.setAlwaysOnTop(steamMonitorAlwaysOnTop, 'screen-saver', 1)
  } catch {}

  const devUrl = process.env['VITE_DEV_SERVER_URL']
  const indexPath = path.join(__dirname, '../dist/index.html')

  if (devUrl) {
    steamMonitorWindow.loadURL(`${devUrl}#steam-monitor`)
  } else if (fs.existsSync(indexPath)) {
    steamMonitorWindow.loadFile(indexPath, { hash: 'steam-monitor' })
  } else {
    steamMonitorWindow.loadURL('http://127.0.0.1:5173/#steam-monitor')
  }

  steamMonitorWindow.once('ready-to-show', () => {
    if (!steamMonitorWindow || steamMonitorWindow.isDestroyed()) return
    bringSteamMonitorToForeground()
  })

  // Whenever another application (game/browser) is clicked and steamMonitorWindow loses focus,
  // immediately re-assert topmost so Windows OS does not demote it behind other windows!
  steamMonitorWindow.on('blur', () => {
    enforceSteamMonitorTopmost()
  })

  steamMonitorWindow.on('show', () => {
    enforceSteamMonitorTopmost()
    steamMonitorWindow?.moveTop()
  })

  steamMonitorWindow.on('restore', () => {
    enforceSteamMonitorTopmost()
    steamMonitorWindow?.moveTop()
  })

  steamMonitorWindow.on('closed', () => {
    steamMonitorWindow = null
    if (steamMonitorWatchdog) {
      clearInterval(steamMonitorWatchdog)
      steamMonitorWatchdog = null
    }
  })

  // Periodic watchdog: ensures topmost status is never dropped by Windows OS or full-screen apps
  if (steamMonitorWatchdog) clearInterval(steamMonitorWatchdog)
  steamMonitorWatchdog = setInterval(() => {
    if (
      steamMonitorWindow &&
      !steamMonitorWindow.isDestroyed() &&
      steamMonitorAlwaysOnTop &&
      steamMonitorWindow.isVisible() &&
      !steamMonitorWindow.isMinimized()
    ) {
      enforceSteamMonitorTopmost()
    }
  }, 2000)
}

export function toggleSteamMonitorWindowInternal(): { isOpen: boolean } {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    // If the window is visible, NOT minimized, AND currently focused:
    // The user is actively focused on it and pressed F9 to dismiss it
    if (steamMonitorWindow.isVisible() && !steamMonitorWindow.isMinimized() && steamMonitorWindow.isFocused()) {
      steamMonitorWindow.close()
      steamMonitorWindow = null
      return { isOpen: false }
    } else {
      // If it is hidden, minimized, or behind other programs/windows:
      // Bring it directly to the absolute foreground!
      bringSteamMonitorToForeground()
      return { isOpen: true }
    }
  } else {
    createSteamMonitorWindow()
    return { isOpen: true }
  }
}

ipcMain.handle('open-steam-monitor-window', () => {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    bringSteamMonitorToForeground()
    return { success: true }
  }
  createSteamMonitorWindow()
  return { success: true }
})

ipcMain.handle('close-steam-monitor-window', () => {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    steamMonitorWindow.close()
    steamMonitorWindow = null
  }
  return { success: true }
})

ipcMain.handle('minimize-steam-monitor-window', () => {
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    steamMonitorWindow.minimize()
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('bring-steam-monitor-to-front', () => {
  const success = bringSteamMonitorToForeground()
  return { success }
})

ipcMain.handle('set-steam-monitor-always-on-top', (_event, flag: boolean) => {
  steamMonitorAlwaysOnTop = flag
  if (steamMonitorWindow && !steamMonitorWindow.isDestroyed()) {
    steamMonitorWindow.setAlwaysOnTop(flag, 'screen-saver', 1)
    if (flag) {
      steamMonitorWindow.moveTop()
    }
    return { success: true, alwaysOnTop: flag }
  }
  return { success: false, alwaysOnTop: flag }
})

ipcMain.handle('toggle-steam-monitor-window', () => {
  return toggleSteamMonitorWindowInternal()
})

ipcMain.on('steam-telemetry-broadcast', (_event, data) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== _event.sender) {
      win.webContents.send('steam-telemetry-update', data)
    }
  }
})

ipcMain.handle('open-add-friend-modal', () => {
  addFriendReveal.open()
  return { success: true }
})
ipcMain.handle('add-friend-modal-ready', (event) => {
  addFriendReveal.ready(event.sender)
  return { success: true }
})
ipcMain.handle('add-friend-modal-closed', (event) => {
  addFriendReveal.dismiss(event.sender)
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

ipcMain.handle('window:invalidate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.invalidate()
  }
  return true
})

ipcMain.handle('system:set-auto-launch', (_event, data: { enabled: boolean; startMinimized: boolean }) => saveSettingsPatch({ startOnBoot: data.enabled, startMinimized: data.startMinimized }))
ipcMain.handle('system:get-auto-launch', () => autoLaunchSettings.read((inMemorySettings || startupSettings).startMinimized === true))
ipcMain.handle('system:open-startup-settings', async () => { if (process.platform === 'win32') await openExternalApplication('ms-settings:startupapps') })
ipcMain.handle('window:get-state', () => mainWindowState(mainWindow))

ipcMain.handle('system:open-path', async (_event, fullPath: string) => {
  try {
    if (!fullPath) return { success: false, error: 'No path provided' }
    const errorMsg = await openExternalPath(fullPath)
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

ipcMain.handle('games:register-installed', (_event, records: unknown) => ({ registered: registerInstalledGameRecords(records) }))

ipcMain.handle('games:scan', async (_event, options?: { scanUninstalledSteam?: boolean }) => {
  try {
    const games = await scanGames((progress) => {
      mainWindow?.webContents.send('games:scan-progress', progress)
    }, options)
    games.forEach(g => {
      if (g.executable) registerGameExe(g.executable, g.name, g.steamId)
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

ipcMain.handle('games:uninstall', async (_event, game: { id: string; name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string; platform?: string }) => {
  try {
    if (game.id?.startsWith('riot-') || game.launchUrl?.startsWith('eclipse-game://riot/')) {
      throw new Error('Uninstall this game through Riot Client or Windows Installed Apps so its launcher and anti-cheat components are handled correctly.')
    }
    // 1. Steam game: trigger Steam's native uninstaller dialog
    const steamId = game.steamId || game.launchUrl?.match(/^steam:\/\/(?:rungameid|install)\/(\d+)$/i)?.[1]
    if (steamId && /^\d+$/.test(String(steamId))) {
      await openAllowedExternal(`steam://uninstall/${steamId}`)
      return { success: true }
    }

    // 2. Non-Steam / Custom game
    if (game.installPath && fs.existsSync(game.installPath)) {
      const stat = fs.statSync(game.installPath)
      const folderPath = stat.isFile() ? path.dirname(game.installPath) : game.installPath

      if (fs.existsSync(folderPath)) {
        try {
          const files = fs.readdirSync(folderPath)
          const uninstaller = files.find(f => {
            const l = f.toLowerCase()
            return (l.startsWith('unins') && l.endsWith('.exe')) || l === 'uninstall.exe'
          })

          if (uninstaller) {
            const uninstallerPath = path.join(folderPath, uninstaller)
            const error = await openExternalPath(uninstallerPath)
            if (error) throw new Error(error)
            return { success: true, uninstallerLaunched: true }
          }
        } catch {}

        // A library entry must never turn an application root into an uninstall target.
        const target = fs.realpathSync(stat.isFile() ? game.installPath : folderPath)
        const protectedDirectories = [path.parse(target).root, app.getPath('home'), app.getPath('appData'), app.getPath('userData'), process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[]
        if (protectedDirectories.some(directory => path.resolve(directory).toLowerCase() === target.toLowerCase())) {
          throw new Error('Refusing to uninstall a protected directory')
        }
        // Fallback: move game folder safely to Recycle Bin
        await shell.trashItem(stat.isFile() ? game.installPath : folderPath)
        return { success: true, trashed: true }
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('Failed to uninstall game:', err)
    return { success: false, error: err.message || String(err) }
  }
})

// ─── Game Launch ─────────────────────────────────────────────────────────────
let runningGameProcess: LaunchedProcess | null = null

ipcMain.handle('games:launch', async (_event, launchUrl: string) => {
  try {
    if (typeof launchUrl !== 'string' || !launchUrl.trim()) throw new Error('Missing game launch target')
    if (!launchUrl.includes('://') && /\.exe$/i.test(launchUrl)) {
      registerGameExe(path.basename(launchUrl), path.basename(launchUrl, '.exe'), undefined, true)
    }

    if (launchUrl.startsWith('eclipse-game:')) {
      await launchRiotGame(launchUrl)
    } else if (launchUrl.includes('://')) {
      await openAllowedExternal(launchUrl)
    } else {
      // Custom .exe path
      runningGameProcess = await launchExecutable(launchUrl, child => {
        if (runningGameProcess !== child) return
        runningGameProcess = null
        setTimeout(() => {
          const detected = getCurrentDetectedGame()
          if (mainWindow && !mainWindow.isDestroyed() && !detected) {
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
    const pid = getCurrentDetectedGamePid() || runningGameProcess?.pid
    if (pid && Number.isSafeInteger(pid) && pid > 0) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve, reject) => {
          execFile('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true, timeout: 10_000 }, err => err ? reject(err) : resolve())
        })
      } else {
        process.kill(pid)
      }
    }
    runningGameProcess = null

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

ipcMain.handle('dialog:open-json-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Source JSON File',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  try {
    const content = require('fs').readFileSync(result.filePaths[0], 'utf-8')
    return content
  } catch (e) {
    console.error('Failed to read JSON file:', e)
    return null
  }
})

// ─── Settings Storage & App Lifecycle ───────────────────────────────────────
ipcMain.handle('app:relaunch', async () => {
  const args = process.argv.slice(1).filter(arg => arg !== '--autostart' && arg !== '--hidden')
  if (!await relaunchOutsideMemoryJob(process.execPath, args, process.cwd())) app.relaunch({ args })
  app.exit(0)
})

ipcMain.handle('app:switch-mode', async (event, value: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || value !== 'launcher' && value !== 'clips') return { success: false, error: 'Invalid app mode' }
  if (hasDownloadWork() || !beginModeSwitch()) return { success: false, error: 'Eclipse is busy. Finish active downloads or clip operations first.' }
  const previous = normalizeAppMode((inMemorySettings || startupSettings).appMode)
  try {
    const saved = await saveSettingsPatch({ appMode: value })
    if (!saved.success) throw new Error(saved.error)
    const args = process.argv.slice(1).filter(arg => arg !== '--autostart' && arg !== '--hidden')
    if (!await relaunchOutsideMemoryJob(process.execPath, args, process.cwd())) app.relaunch({ args })
    setTimeout(() => app.exit(0), 150)
    return { success: true }
  } catch (error) {
    await saveSettingsPatch({ appMode: previous })
    cancelModeSwitch()
    return { success: false, error: error instanceof Error ? error.message : 'Unable to switch mode' }
  }
})

let writeSettingsTimeout: NodeJS.Timeout | null = null
let inMemorySettings: Record<string, unknown> | null = null

ipcMain.handle('settings:get', () => {
  try {
    if (inMemorySettings) return inMemorySettings
    if (fs.existsSync(settingsPath)) {
      inMemorySettings = getSavedSettings()
      return inMemorySettings
    }
    return getSavedSettings()
  } catch {
    return withKeyforsteamDefaults({})
  }
})

let settingsCommitQueue = Promise.resolve()
const performanceHotkey=new PerformanceOverlayHotkey(globalShortcut,async()=>{
  const result=await saveSettingsPatch(()=>({overlayPerformance:getSavedSettings().overlayPerformance!==true}))
  if(!result.success)throw new Error(result.error)
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('settings:update',{overlayPerformance:getSavedSettings().overlayPerformance===true})
})
function saveSettingsPatch(data: Record<string, unknown>|(()=>Record<string,unknown>)) {
  const operation = settingsCommitQueue.then(() => commitSettingsPatch(typeof data==='function'?data():data))
  settingsCommitQueue = operation.then(() => {}, () => {})
  return operation
}
async function commitSettingsPatch(data: Record<string, unknown>) {
  let rollbackHotkey:(()=>void)|undefined
  try {
    if (!inMemorySettings) {
      inMemorySettings = getSavedSettings()
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid settings patch')
    data = withoutRetiredSettings(data)
    const previousSettings = inMemorySettings || {}
    if(runtimeAppMode==='launcher'&&'overlayPerformanceHotkey' in data){
      const previous=performanceHotkey.binding;performanceHotkey.apply(data.overlayPerformanceHotkey)
      rollbackHotkey=()=>performanceHotkey.apply(previous)
    }
    const startupChanged = 'startOnBoot' in data || 'startMinimized' in data
    const previousStartup = startupChanged ? autoLaunchSettings.read(previousSettings.startMinimized === true) : undefined
    const newSettings = commitStartupSettings(previousSettings, data, next => writeJsonAtomicSync(settingsPath, next),
      (enabled, minimized) => autoLaunchSettings.apply(enabled, minimized, 'startOnBoot' in data || !previousStartup?.blocked),
      previousStartup?.supported ? () => { autoLaunchSettings.apply(previousStartup.registered || previousStartup.blocked, previousSettings.startMinimized === true, !previousStartup.blocked) } : undefined)
    inMemorySettings = newSettings
    
    // Auto-sync username and identity properties to Windows Registry and UserProfile file
    if (data.username || data.friendCode || data.userUid || data.accountSecret) {
      savePersistentIdentity({
        username: typeof data.username === 'string' ? data.username : undefined,
        friendCode: typeof data.friendCode === 'string' && data.friendCode.startsWith('ECL-') ? data.friendCode : undefined,
        canonicalUid: typeof data.userUid === 'string' ? data.userUid : undefined,
        accountSecret: typeof data.accountSecret === 'string' ? data.accountSecret : undefined,
      }).catch((e) => console.warn('[Main] Failed to auto-sync persistent identity from settings:set:', e))
    }

    // Live update keybinds if they were changed
    if (data.rlScoreboardKeyKb !== undefined || data.rlScoreboardKeyCtrl !== undefined) {
      setInputKeybinds(String(newSettings.rlScoreboardKeyKb || 'Tab'), String(newSettings.rlScoreboardKeyCtrl || 'Select'))
    }

    if (data.overlayMediaKeybinds !== undefined) {
      const getMediaWindows = () => {
        const wins: BrowserWindow[] = []
        if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
        const overlayWin = getOverlayWindow()
        if (overlayWin && !overlayWin.isDestroyed()) wins.push(overlayWin)
        return wins
      }
      registerMediaGlobalHotkeys(newSettings.overlayMediaKeybinds as any, getMediaWindows, newSettings.overlayMediaSource as any)
    }

    const overlayWin = getOverlayWindow()
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('settings:update', newSettings)
    }

    // Immediate in-memory sync to process monitor and overlay
    updateSettingsInMemory(newSettings)
    if('overlayCS2Stats' in data)refreshAutoClipSettings()
    syncOverlaySettingsLive(newSettings)
    return { success: true }
  } catch (err: unknown) {
    try{rollbackHotkey?.()}catch{}
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
ipcMain.handle('settings:set', (_event, data: Record<string, unknown>) => saveSettingsPatch(data))
ipcMain.handle('cs2:stats-get',()=>cs2Session.read())
ipcMain.handle('cs2:stats-reset',()=>{const stats=cs2Session.reset();getOverlayWindow()?.webContents.send('cs2:stats',stats);return stats})

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
ipcMain.handle('notification:show', async (_event, options: { title?: unknown; body?: unknown; peerId?: unknown; silent?: unknown }) => {
  if (!options || typeof options.title !== 'string' || typeof options.body !== 'string') return { success: false }
  const peer = typeof options.peerId === 'string' && options.peerId.length <= 128 && !options.peerId.includes('/') ? options.peerId : undefined
  const success = await showDesktopNotification({ title: options.title.slice(0, 200), body: options.body.slice(0, 2000), silent: options.silent === true }, () => {
    if (peer) { chatWindow.open(peer); return }
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  return { success }
})

ipcMain.handle('overlay:open-edit', (_event, game: unknown) => {
  const s = getSavedSettings()
  if (game !== undefined) {
    if (!isCrosshairGameId(game)) throw new Error('Unknown game overlay profile')
    const target = CROSSHAIR_GAMES.find(target => target.id === game)!
    openOverlayEditMode(buildOverlayData(s, { name: target.name }))
    return
  }
  openOverlayEditMode({
    name: 'Rocket League',
    positions: s.overlayPositions,
    settings: {
      performance: s.overlayPerformance,
      crosshair: s.overlayCrosshair,
      cps: s.overlayCps || s.overlayRobloxCps,
      robloxCps: s.overlayCps || s.overlayRobloxCps,
      robloxTimer: s.overlayRobloxTimer,
      rlHud: s.overlayRLHud,
      overlayCS2Stats:s.overlayCS2Stats,
      overlayRLSteam: s.overlayRLSteam,
      overlayController: s.overlayController,
      overlayRLController: s.overlayRLController || s.overlayController,
      rlControllerSkin: s.rlControllerSkin || 'ps5_white',
      rlControllerUrl: s.rlControllerUrl || 'https://gamepadviewer.com/?p=1&s=ps5_white',
      rlControllerScale: s.rlControllerScale || 80,
      metrics: s.overlayMetrics,
      crosshairConfig: s.crosshairConfig,
      steamProfileUrl: s.steamProfileUrl,
      rlSteamAvatarScale: s.rlSteamAvatarScale,
      overlayMedia: s.overlayMedia,
      overlayMediaSource: s.overlayMediaSource,
      overlayMediaAutoHide: s.overlayMediaAutoHide,
      overlayMediaVisualizer: s.overlayMediaVisualizer !== false,
      language: s.language || 'de',
    }
  })
})

ipcMain.handle('overlay:exit-edit', () => {
  exitEditMode()
  syncOverlaySettingsLive()
})

ipcMain.handle('overlay:save-positions', (_event, positions: Record<string, unknown>) => {
  try {
    const existing = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      : {}
    inMemorySettings = { ...existing, overlayPositions: positions }
    writeJsonAtomicSync(settingsPath, inMemorySettings)
    updateSettingsInMemory(inMemorySettings)
    exitEditMode()
    syncOverlaySettingsLive(inMemorySettings)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
})


// ─── Cloudflare-Proof Source Engine & Disk Caching ──────────────────────────────
ipcMain.handle('sources:get-all-cached', async () => {
  try {
    return getAllCachedSources()
  } catch (e) {
    console.error('[Main] get-all-cached error:', e)
    return []
  }
})

ipcMain.handle('sources:fetch-and-cache', async (_event, rawUrl: string) => {
  try {
    return await fetchAndCacheSource(rawUrl)
  } catch (e: any) {
    console.error('[Main] fetch-and-cache error:', e)
    return { success: false, error: e?.message || 'Fetch error' }
  }
})

ipcMain.handle('sources:clear-cache', async (_event, rawUrl?: string) => {
  try {
    if (rawUrl) {
      removeCachedSource(rawUrl)
    } else clearCachedSources()
    return { success: true }
  } catch (e) {
    return { success: false }
  }
})

ipcMain.handle('sources:save-raw-source', async (_event, rawUrl: string, name: string, data: any[]) => {
  try {
    saveCachedSource(rawUrl, name, data)
    return { success: true }
  } catch (e) {
    return { success: false }
  }
})

ipcMain.handle('source:fetch-cf', async (_event, rawUrl: string) => {
  const result = await fetchAndCacheSource(rawUrl)
  if (result.success && result.data) {
    return JSON.stringify({ name: result.name, downloads: result.data })
  }
  return null
})

// ─── Generic Fetch (CORS Bypass) ──────────────────────────────────────────────
ipcMain.handle('util:fetch', async (_event, url: string, customHeaders?: Record<string, string>) => {
  try {
    const res = await requestText({ id: 'legacy-fetch', url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        ...(customHeaders || {})
      }
    })
    if (res.status < 200 || res.status >= 300) return null
    return res.body
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
  return { success: false, error: 'Rocket League is not supported by the public Tracker API.' }
})

ipcMain.handle('rl:reset-session', () => {
  resetRLSession()
  return { success: true }
})

ipcMain.handle('rl:get-detected-player', () => {
  return extractPlayerFromLog()
})
ipcMain.handle('rl:get-state', () => getRLState())

// ─── App Lifecycle ────────────────────────────────────────────────────────────
ipcMain.handle('system:open-url', async (_event, url: string, fallbackUrl?: string) => {
  try {
    if (url) {
      await openAllowedExternal(url)
      return { success: true }
    }
  } catch (err: any) {
    console.warn('[system:open-url] Primary launch failed, checking fallback:', err?.message)
    if (fallbackUrl) {
      try {
        await openAllowedExternal(fallbackUrl)
        return { success: true, fallback: true }
      } catch (fErr: any) {
        return { success: false, error: fErr?.message || String(fErr) }
      }
    }
    return { success: false, error: err?.message || String(err) }
  }
  return { success: false, error: 'No URL provided' }
})
ipcMain.handle('open-url', async (_event, url: string, fallbackUrl?: string) => {
  try {
    if (url) {
      await openAllowedExternal(url)
      return { success: true }
    }
  } catch (err: any) {
    if (fallbackUrl) {
      try {
        await openAllowedExternal(fallbackUrl)
        return { success: true, fallback: true }
      } catch {}
    }
    return { success: false, error: err?.message || String(err) }
  }
  return { success: false, error: 'No URL provided' }
})

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

ipcMain.handle('games:create-shortcut', async (_event, game: { name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string }) => {
  try {
    const desktopPath = app.getPath('desktop')
    const safeName = (game.name || 'Game').replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 120) || 'Game'

    // 1. Steam game shortcut (.url)
    const steamId = game.steamId || game.launchUrl?.match(/^steam:\/\/(?:rungameid|install)\/(\d+)$/i)?.[1]
    if (steamId && /^\d+$/.test(String(steamId))) {
      const urlContent = `[{000214A0-0000-0000-C000-000000000046}]\nProp3=19,0\n[InternetShortcut]\nIDList=\nURL=steam://rungameid/${steamId}\nIconIndex=0\n`
      const shortcutPath = path.join(desktopPath, `${safeName}.url`)
      fs.writeFileSync(shortcutPath, urlContent, 'utf-8')
      return { success: true }
    }

    // 2. Executable / folder shortcut (.lnk)
    if (game.installPath && fs.existsSync(game.installPath)) {
      const stat = fs.statSync(game.installPath)
      const isFile = stat.isFile()
      let exePath = isFile ? game.installPath : ''
      let workDir = isFile ? path.dirname(game.installPath) : game.installPath

      if (!isFile) {
        try {
          const files = fs.readdirSync(game.installPath)
          const found = files.find(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('unins') && !f.toLowerCase().includes('crash'))
          if (found) {
            exePath = path.join(game.installPath, found)
          }
        } catch {}
      }

      if (exePath && fs.existsSync(exePath)) {
        const shortcutPath = path.join(desktopPath, `${safeName}.lnk`)
        const success = shell.writeShortcutLink(shortcutPath, 'create', {
          target: exePath,
          cwd: workDir,
          icon: exePath,
          iconIndex: 0,
          description: game.name
        })
        return { success }
      }
    }

    // 3. Fallback: URL shortcut
    if (isAllowedExternalUrl(game.launchUrl)) {
      const urlContent = `[InternetShortcut]\nURL=${game.launchUrl}\nIconIndex=0\n`
      const shortcutPath = path.join(desktopPath, `${safeName}.url`)
      fs.writeFileSync(shortcutPath, urlContent, 'utf-8')
      return { success: true }
    }

    return { success: false, error: 'Executable or URL not found' }
  } catch (error: any) {
    console.error('Failed to create game desktop shortcut:', error)
    return { success: false, error: error?.message || 'Failed' }
  }
})

ipcMain.handle('rl:fetch-steam-avatar', async (_, url: string) => {
  return await fetchSteamAvatar(url)
})

app.whenReady().then(async () => {
  await releaseInheritedMemoryLimits()
  initAssetProtocol()
  initRendererPermissions(session.defaultSession)

  try {
    protocol.handle('local-media', request => {
      const directories = [path.join(app.getPath('videos'), 'Eclipse Clips'), path.join(app.getPath('userData'), 'Eclipse Clips')]
      try {
        const settings = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'clip_settings.json'), 'utf8'))
        if (typeof settings.savePath === 'string' && path.isAbsolute(settings.savePath)) directories.push(settings.savePath)
      } catch {}
      return serveLocalMedia(request, directories)
    })
  } catch (err) {
    console.warn('[Protocol] local-media registration error:', err)
  }

  await createWindow()

  // Register global hotkey F9 to toggle and bring Steam Inspector to front
  try {
    if (runtimeAppMode === 'launcher') globalShortcut.register('F9', () => {
      toggleSteamMonitorWindowInternal()
    })
  } catch (err) {
    console.warn('[SteamMonitor] Failed to register global F9 hotkey:', err)
  }

  // Check initial startup deep link argument
  const initialDeepLink = process.argv.find(arg => arg.toLowerCase().includes('eclipse:'))
  if (initialDeepLink) {
    handleDeepLink(initialDeepLink)
  }
})

app.on('before-quit', () => {
  isQuitting = true
  stopProcessMonitor()
  shutdownGameFpsAccess()
  stopHttpDownloads()
  stopTorrentDownloads()
  stopVoiceListener()
  stopMemoryOptimizer()
  stopInputService()
  stopGamepadService()
  stopDiscordRPC()
  stopFreeGamesRadar()
  unregisterAllMediaHotkeys()
  try {
    globalShortcut.unregister('F9')
  } catch {}
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    } catch {}
  }
})

app.on('window-all-closed', () => {
  stopRLService()
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.destroy()
    } catch {}
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) void createWindow().catch(error => console.error('[MainWindow] Could not create window:', error))
  else restoreAndFocusMainWindow()
})

// ─── Discord RPC ─────────────────────────────────────────────────────────────
ipcMain.handle('discord:set-activity', () => { syncDiscordPresence(); return { success: true } })
ipcMain.handle('discord:set-idle-activity', () => { syncDiscordPresence(); return { success: true } })
ipcMain.handle('discord:clear-activity', () => { syncDiscordPresence(); return { success: true } })
ipcMain.handle('discord:set-download-activity', (_event, name: string) => { setLauncherDownloadActivity(name); return { success: true } })
ipcMain.handle('discord:update-download', (_event, name: string | null) => { setLauncherDownloadActivity(name); return { success: true } })

// ─── Free Games Radar ────────────────────────────────────────────────────────
ipcMain.handle('freegames:check-now', async () => {
  return await checkFreeGames(true)
})

ipcMain.handle('freegames:get-cached', async () => {
  return getCachedFreeGames()
})


app.on('will-quit', () => {
  unregisterAllMediaHotkeys()
  setTimeout(() => {
    process.exit(0)
  }, 400).unref()
})

app.on('web-contents-created', (_event, contents) => attachRendererLogging(contents))
