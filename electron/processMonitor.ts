import { exec, execFile } from 'child_process'
import { BrowserWindow, app } from 'electron'
import { setDiscordActivity, setDiscordIdleActivity, setDiscordDownloadActivity, clearDiscordActivity } from './discordRPC'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { showOverlay, hideOverlay, getOverlayWindow, isEditModeActive } from './overlayManager'
import { startRLService, stopRLService } from './rlService'
import { addPlaytimeRecord } from './playtimeService'
import { setActiveGameMetrics } from './metricsService'
import { startGameFpsMonitor, stopGameFpsMonitor } from './gameFpsService'
import { startRobloxTracker, stopRobloxTracker } from './robloxService'

interface ActiveDetectedGame {
  name: string
  exeName: string
  startTime: number
}

// Helper to read user Discord RPC and Overlay settings with in-memory caching
let cachedSettings: any = null
let lastSettingsRead = 0
let robloxTrackerActive = false

export function invalidateSettingsCache() {
  cachedSettings = null
  lastSettingsRead = 0
}

function getAppSettings() {
  const now = Date.now()
  if (cachedSettings && (now - lastSettingsRead < 15000)) {
    return cachedSettings
  }

  const defaultPositions = {
    performance: { xPct: 0.02, yPct: 0.03 },
    robloxTimer: { xPct: 0.75, yPct: 0.03 },
    robloxCps: { xPct: 0.75, yPct: 0.12 },
    crosshair: { xPct: 0.5, yPct: 0.5 },
    rlHud: { xPct: 0.02, yPct: 0.03 },
    rlSteamAvatar: { xPct: 0.02, yPct: 0.90 }, // Bottom-left default
    rlController: { xPct: 0.78, yPct: 0.65 }, // Bottom-right default
  }
  const defaultMetrics = { fps: true, cpu: true, ram: true, gpu: true, ping: false, time: true, layout: 'vertical' as const }

  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      cachedSettings = {
        gamePerformanceMode: s.gamePerformanceMode ?? true,
        autoMinimizeOnGame: s.autoMinimizeOnGame ?? true,
        autoRestoreOnGameStop: s.autoRestoreOnGameStop ?? true,
        discordEnabled: s.discordRpc ?? true,
        discordActivityStyle: s.discordActivityStyle || s.discordRpcActivityStyle || 'clipping',
        discordPrivacyMode: s.discordRpcPrivacyMode ?? false,
        discordRpcRobloxSubGame: s.discordRpcRobloxSubGame ?? true,
        discordRpcAnimatedText: s.discordRpcAnimatedText ?? false,
        showDownloads: s.discordRpcShowDownloads ?? true,
        showIdle: s.discordRpcIdle ?? true,
        overlayPerformance: s.overlayPerformance ?? false,
        overlayCrosshair: s.overlayCrosshair ?? false,
        overlayGeneralAlwaysOn: s.overlayGeneralAlwaysOn ?? false,
        overlayCps: s.overlayCps ?? false,
        overlayController: s.overlayController ?? false,
        overlayRobloxTimer: s.overlayRobloxTimer ?? false,
        overlayRobloxCps: s.overlayRobloxCps ?? false,
        overlayRLHud: s.overlayRLHud ?? false,
        overlayRLSteam: s.overlayRLSteam ?? false,
        overlayRLController: s.overlayRLController ?? false,
        rlPlaylist: s.rlPlaylist ?? '2v2',
        trnApiKey: s.trnApiKey ?? '',
        steamProfileUrl: s.steamProfileUrl ?? '',
        rlScoreboardKeyKb: s.rlScoreboardKeyKb ?? 'Tab',
        rlScoreboardKeyCtrl: s.rlScoreboardKeyCtrl ?? 'Select',
        rlSteamAvatarScale: s.rlSteamAvatarScale ?? 85,
        rlControllerSkin: s.rlControllerSkin ?? 'ps5_white',
        rlControllerUrl: s.rlControllerUrl ?? 'https://gamepadviewer.com/?p=1&s=ps5_white',
        rlControllerScale: s.rlControllerScale ?? 80,
        overlayMetrics: s.overlayMetrics ?? defaultMetrics,
        crosshairConfig: s.crosshairConfig ?? null,
        overlayPositions: s.overlayPositions ?? defaultPositions,
      }
      lastSettingsRead = now
      return cachedSettings
    }
  } catch (e) {}

  cachedSettings = {
    gamePerformanceMode: true,
    autoMinimizeOnGame: true,
    autoRestoreOnGameStop: true,
    discordEnabled: true, discordActivityStyle: 'clipping', discordPrivacyMode: false, showDownloads: true, showIdle: true,
    overlayPerformance: false, overlayCrosshair: false, overlayGeneralAlwaysOn: false, 
    overlayCps: false, overlayController: false, overlayRobloxTimer: false, overlayRobloxCps: false, 
    overlayRLHud: false, overlayRLSteam: false, overlayRLController: false, rlPlaylist: '2v2' as const, trnApiKey: '',
    steamProfileUrl: '', rlScoreboardKeyKb: 'Tab', rlScoreboardKeyCtrl: 'Select', rlSteamAvatarScale: 85,
    rlControllerSkin: 'ps5_white' as const, rlControllerUrl: 'https://gamepadviewer.com/?p=1&s=ps5_white', rlControllerScale: 80,
    overlayMetrics: defaultMetrics,
    crosshairConfig: null,
    overlayPositions: defaultPositions,
  }
  lastSettingsRead = now
  return cachedSettings
}


// Known game executable names mapping
const KNOWN_GAME_EXES: Record<string, string> = {
  // Rockstar Games & GTA Franchise
  'gta5_enhanced.exe': 'Grand Theft Auto V Enhanced',
  'gta5_enhanced_be.exe': 'Grand Theft Auto V Enhanced',
  'playgtav.exe': 'Grand Theft Auto V',
  'gta5.exe': 'Grand Theft Auto V',
  'gtav.exe': 'Grand Theft Auto V',
  'gtavlauncher.exe': 'Grand Theft Auto V',
  'gta5launcher.exe': 'Grand Theft Auto V',
  'gtav_dx11.exe': 'Grand Theft Auto V',
  'fivem.exe': 'Grand Theft Auto V',
  'fivem_b2699_gtaprocess.exe': 'Grand Theft Auto V',
  'fivem_b3095_gtaprocess.exe': 'Grand Theft Auto V',
  'fivem_b2372_gtaprocess.exe': 'Grand Theft Auto V',
  'fivem_b2802_gtaprocess.exe': 'Grand Theft Auto V',
  'fivem_b2545_gtaprocess.exe': 'Grand Theft Auto V',
  'fivem_b2189_gtaprocess.exe': 'Grand Theft Auto V',
  'fivem_gta_process.exe': 'Grand Theft Auto V',
  'rdr2.exe': 'Red Dead Redemption 2',
  'playrdr2.exe': 'Red Dead Redemption 2',
  'rdr2launcher.exe': 'Red Dead Redemption 2',
  'rdr.exe': 'Red Dead Redemption',
  'playrdr.exe': 'Red Dead Redemption',
  'gtaiv.exe': 'Grand Theft Auto IV',
  'playgtaiv.exe': 'Grand Theft Auto IV',
  'sanandreas.exe': 'GTA: San Andreas – The Definitive Edition',
  'vicecity.exe': 'GTA: Vice City – The Definitive Edition',
  'libertycity.exe': 'GTA III – The Definitive Edition',
  'gta_sa.exe': 'Grand Theft Auto: San Andreas',
  'gta_vc.exe': 'Grand Theft Auto: Vice City',
  'gta3.exe': 'Grand Theft Auto III',
  'maxpayne3.exe': 'Max Payne 3',
  'playmaxpayne3.exe': 'Max Payne 3',
  'lanoire.exe': 'L.A. Noire',
  'lanoption.exe': 'L.A. Noire',
  'bully.exe': 'Bully: Scholarship Edition',

  // Other Popular Games
  'robloxplayerbeta.exe': 'Roblox',
  'robloxplayerlauncher.exe': 'Roblox',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'valorant-win64-shipping.exe': 'VALORANT',
  'leagueclient.exe': 'League of Legends',
  'league of legends.exe': 'League of Legends',
  'minecraftlauncher.exe': 'Minecraft',
  'rocketleague.exe': 'Rocket League',
  'cs2.exe': 'Counter-Strike 2',
  'dota2.exe': 'Dota 2',
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'eldenring.exe': 'Elden Ring',
  'apex.exe': 'Apex Legends',
  'overwatch.exe': 'Overwatch 2',
  'genshinimpact.exe': 'Genshin Impact',
  'starrail.exe': 'Honkai: Star Rail',
  'fallguys_client_game.exe': 'Fall Guys',
  'palworld-win64-shipping.exe': 'Palworld',
  'helldivers2.exe': 'Helldivers 2',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'witcher3.exe': 'The Witcher 3: Wild Hunt',
  'fc24.exe': 'EA SPORTS FC 24',
  'fc25.exe': 'EA SPORTS FC 25',
  // Dead by Daylight
  'deadbydaylight.exe': 'Dead by Daylight',
  'deadbydaylight-win64-shipping.exe': 'Dead by Daylight',
  'deadbydaylight_be.exe': 'Dead by Daylight',
  'deadbydaylight_eac.exe': 'Dead by Daylight',
  'deadbydaylight_dx11.exe': 'Dead by Daylight',
  'deadbydaylight_dx12.exe': 'Dead by Daylight'
}

// Dynamic map for custom user-added or scanned games
const customGameExes: Record<string, string> = {}

export const GENERIC_PROCESS_BLACKLIST = new Set([
  'crashpad_handler.exe', 'crashreporter.exe', 'crashreport.exe', 'crashreportclient.exe',
  'unitycrashhandler64.exe', 'unitycrashhandler32.exe', 'unins000.exe', 'uninstall.exe',
  'setup.exe', 'dxsetup.exe', 'dxwebsetup.exe', 'vcredist_x64.exe', 'vcredist_x86.exe',
  'vc_redist.x64.exe', 'vc_redist.x86.exe', 'dotnet.exe', 'easyanticheat.exe', 'easyanticheat_setup.exe',
  'eac_setup.exe', 'anticheat_setup.exe', 'battleye.exe', 'beservice.exe', 'senddump.exe',
  'epicwebhelper.exe', 'steamwebhelper.exe', 'cefprocess.exe', 'webview2.exe', 'msedgewebview2.exe',
  'cmd.exe', 'conhost.exe', 'powershell.exe', 'node.exe', 'electron.exe', 'chrome.exe', 'msedge.exe',
  'discord.exe', 'spotify.exe', 'steam.exe', 'epicgameslauncher.exe', 'explorer.exe', 'taskmgr.exe',
  'gameoverlayui.exe', 'overlay.exe', 'launcher.exe', 'epicgameslauncher.exe', 'origin.exe',
  'eaconnect_interface.exe', 'upc.exe', 'uplay.exe', 'ubisoftconnect.exe', 'riotclientservices.exe',
  // Wallpaper Engine background worker processes
  'wallpaper32.exe', 'wallpaper64.exe', 'wallpaper.exe', 'ui32.exe', 'webwallpaper32.exe', 'webwallpaper64.exe',
  'wallpaper32_neon.exe', 'wallpaper64_neon.exe'
])

export function isIgnoredExe(name: string): boolean {
  if (!name) return true
  const lower = name.toLowerCase().trim()
  if (GENERIC_PROCESS_BLACKLIST.has(lower)) return true
  if (
    lower.includes('crash') || 
    lower.includes('handler') || 
    lower.includes('reporter') || 
    lower.includes('helper') || 
    lower.includes('setup') || 
    lower.includes('redist') || 
    lower.includes('unins') || 
    lower.includes('install') || 
    lower.includes('service') ||
    lower.includes('anticheat') ||
    lower.includes('dump') ||
    lower.includes('wallpaper')
  ) {
    return true
  }
  return false
}

export function registerGameExe(exeName: string, gameName: string) {
  if (!exeName) return
  const cleanExe = exeName.toLowerCase().trim()
  if (cleanExe.endsWith('.exe') && !isIgnoredExe(cleanExe)) {
    customGameExes[cleanExe] = gameName
  }
}

let cachedSteamPathSync: string | null = null;
let hasCheckedSteamPath = false;

// Helper to get steam installation path from registry (Cached)
function getSteamPathSync(): string | null {
  if (hasCheckedSteamPath) return cachedSteamPathSync;
  hasCheckedSteamPath = true;
  try {
    const stdout = require('child_process').execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8' })
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.*)/i)
    if (match && match[1]) {
      cachedSteamPathSync = match[1].trim().replace(/\//g, '\\')
      return cachedSteamPathSync;
    }
  } catch (e) {}
  return null
}

let cachedLibraryFolders: string[] | null = null;
let lastLibraryFolderCheck = 0;

function getSteamLibraryFolders(steamPath: string): string[] {
  if (cachedLibraryFolders && Date.now() - lastLibraryFolderCheck < 3600000) {
    return cachedLibraryFolders;
  }
  const folders = [steamPath]
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (!fs.existsSync(vdfPath)) return folders

  try {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/gi)
    for (const match of pathMatches) {
      const folder = match[1].replace(/\\\\/g, '\\')
      if (folder && folder !== steamPath && !folders.includes(folder)) {
        folders.push(folder)
      }
    }
    cachedLibraryFolders = folders;
    lastLibraryFolderCheck = Date.now();
  } catch (e) {}
  return folders
}

function extractAcfField(content: string, field: string): string | null {
  const regex = new RegExp(`"${field}"\\s+"([^"]+)"`, 'i')
  const match = content.match(regex)
  return match ? match[1] : null
}

// Real-time Steam Download Monitor (Simplified)
function checkSteamActiveDownloads(): { name: string } | null {
  const steamPath = getSteamPathSync()
  if (!steamPath) return null

  const folders = getSteamLibraryFolders(steamPath)

  for (const folder of folders) {
    const steamappsPath = path.join(folder, 'steamapps')
    const downloadingPath = path.join(steamappsPath, 'downloading')
    if (!fs.existsSync(steamappsPath)) continue

    try {
      const manifests = fs.readdirSync(steamappsPath).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))
      
      for (const manifest of manifests) {
        const acfPath = path.join(steamappsPath, manifest)
        const content = fs.readFileSync(acfPath, 'utf-8')
        
        const appId = extractAcfField(content, 'appid')
        const name = extractAcfField(content, 'name')
        const stateFlags = parseInt(extractAcfField(content, 'StateFlags') || '0', 10)

        if (!name || !appId) continue

        const downloadingFolderPath = path.join(downloadingPath, appId)
        const isDownloadingFolderExists = fs.existsSync(downloadingFolderPath)
        const isDownloadingState = (stateFlags & 1024) !== 0 || (stateFlags & 16) !== 0 || isDownloadingFolderExists

        if (isDownloadingState) {
          return { name }
        }
      }
    } catch (e) {}
  }
  return null
}

// Real-time Epic Games Download Monitor (Simplified)
function checkEpicActiveDownloads(): { name: string } | null {
  const epicManifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
  if (!fs.existsSync(epicManifestDir)) return null

  try {
    // 1. Check Pending folder first
    const pendingDir = path.join(epicManifestDir, 'Pending')
    if (fs.existsSync(pendingDir)) {
      const pendingFiles = fs.readdirSync(pendingDir).filter(f => f.endsWith('.item'))
      for (const file of pendingFiles) {
        try {
          const filePath = path.join(pendingDir, file)
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          const name = data.DisplayName || data.AppName
          if (name) return { name }
        } catch (e) {}
      }
    }

    // 2. Check main Manifests directory for incomplete installs
    const files = fs.readdirSync(epicManifestDir).filter(f => f.endsWith('.item'))
    for (const file of files) {
      try {
        const filePath = path.join(epicManifestDir, file)
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (data.bIsIncompleteInstall || data.bIsDownload || data.bIsUpdating) {
          const name = data.DisplayName || data.AppName
          if (name) return { name }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null
}


function findGameExesFast(gameDir: string, depth: number = 0): string[] {
  if (depth > 4) return []
  const found: string[] = []
  try {
    const entries = fs.readdirSync(gameDir, { withFileTypes: true })
    for (const entry of entries) {
      const lower = entry.name.toLowerCase()
      if (entry.isFile() && lower.endsWith('.exe')) {
        if (!isIgnoredExe(lower)) found.push(lower)
      } else if (entry.isDirectory()) {
        if (!['directx', '_commonredist', 'redist', 'support', 'installer', 'mono', 'dotnet', 'burstdebug', '_burst', 'shader', 'logs', 'extras', 'plugins'].some(k => lower.includes(k))) {
          found.push(...findGameExesFast(path.join(gameDir, entry.name), depth + 1))
        }
      }
    }
  } catch (_) {}
  return found
}

export function autoScanInstalledGames() {
  try {
    const steamPath = getSteamPathSync()
    if (steamPath) {
      const folders = getSteamLibraryFolders(steamPath)
      for (const folder of folders) {
        const steamappsPath = path.join(folder, 'steamapps')
        if (!fs.existsSync(steamappsPath)) continue
        try {
          const manifests = fs.readdirSync(steamappsPath).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))
          for (const manifest of manifests) {
            const acfPath = path.join(steamappsPath, manifest)
            const content = fs.readFileSync(acfPath, 'utf-8')
            const name = extractAcfField(content, 'name')
            const installdir = extractAcfField(content, 'installdir')
            if (name && installdir) {
              const gameCommonPath = path.join(steamappsPath, 'common', installdir)
              if (fs.existsSync(gameCommonPath)) {
                const exes = findGameExesFast(gameCommonPath)
                for (const exe of exes) {
                  customGameExes[exe] = name
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Also scan Epic Games
  try {
    const epicManifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
    if (fs.existsSync(epicManifestDir)) {
      const files = fs.readdirSync(epicManifestDir).filter(f => f.endsWith('.item'))
      for (const file of files) {
        try {
          const filePath = path.join(epicManifestDir, file)
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          const name = data.DisplayName || data.AppName
          const exe = data.LaunchExecutable
          if (name && exe && exe.toLowerCase().endsWith('.exe')) {
            const lowerExe = exe.toLowerCase()
            if (!isIgnoredExe(lowerExe)) {
              customGameExes[lowerExe] = name
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

let currentGame: ActiveDetectedGame | null = null
let currentGamePid: number = 0
let missCount = 0
let monitorInterval: NodeJS.Timeout | null = null
let rlServiceActive = false
let lastLibraryScanTime = 0
let downloadCheckTick = 0
let lastActiveDownload: { name: string } | null = null

export function isAnyGameRunning(): boolean {
  return currentGame !== null
}

export function startProcessMonitor(getMainWindow: () => BrowserWindow | null) {
  if (monitorInterval) return

  // Initial immediate scan of all installed Steam & Epic games
  autoScanInstalledGames()

  monitorInterval = setInterval(() => {
    if (process.platform !== 'win32') return

    // Removed 5 minute synchronous scan as it causes 'Not Responding' freezes

    const appSettings = getAppSettings()
    const mainWindow = getMainWindow()

    // Optimization: If a game is actively running with a known PID, perform a 0ms lightweight PID alive check.
    if (currentGame && currentGamePid > 0) {
      let isGameStillAlive = false
      try {
        process.kill(currentGamePid, 0)
        isGameStillAlive = true
      } catch (e: any) {
        // EPERM means process exists but we don't have permission to signal it -> STILL ALIVE!
        if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
          isGameStillAlive = true
        } else {
          isGameStillAlive = false
        }
      }

      if (isGameStillAlive) {
        return
      }

      // Game has exited! Trigger game stopped logic immediately.
      console.log(`[ProcessMonitor] Detected game stopped (PID ${currentGamePid} exited): ${currentGame.name}`)
      try {
        const elapsedMins = Math.max(1, Math.round((Date.now() - (currentGame.startTime || Date.now())) / 60000))
        addPlaytimeRecord(currentGame.name, currentGame.name, elapsedMins)
      } catch (e) {
        console.error('[ProcessMonitor] Failed to record playtime on stop:', e)
      }

      if (appSettings.autoMinimizeOnGame !== false && appSettings.autoRestoreOnGameStop !== false) {
        try {
          if (mainWindow && mainWindow.isMinimized()) {
            mainWindow.restore()
          }
        } catch (_) {}
      }

      if (robloxTrackerActive) {
        robloxTrackerActive = false
        stopRobloxTracker()
      }

      currentGame = null
      currentGamePid = 0
      setActiveGameMetrics(null)
      stopGameFpsMonitor()
      mainWindow?.webContents.send('games:stopped')
      hideOverlay()
      return
    }

    // Run Windows tasklist directly without cmd.exe intermediary (hidden, zero console window)
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      let runningExes = new Set<string>()
      const runningExePids = new Map<string, number>()

      if (!err && stdout) {
        const lines = stdout.split('\r\n')
        for (const line of lines) {
          if (!line) continue
          // CSV format: "name.exe","PID","session","session#","mem usage"
          const parts = line.match(/"([^"]+)"/g)
          if (parts && parts.length >= 2) {
            const exeName = parts[0].replace(/"/g, '').toLowerCase()
            const pid = parseInt(parts[1].replace(/"/g, ''), 10)
            runningExes.add(exeName)
            if (!isNaN(pid)) runningExePids.set(exeName, pid)
          }
        }
      }

      // Combine known games + custom scanned games
      const allExes = { ...KNOWN_GAME_EXES, ...customGameExes }
      
      let detectedName: string | null = null
      let detectedExe: string | null = null

      for (const [exe, name] of Object.entries(allExes)) {
        if (isIgnoredExe(exe)) continue
        if (runningExes.has(exe)) {
          detectedName = name
          detectedExe = exe
          break
        }
      }

      // Heuristic fallback for modded or variantly named executables
      if (!detectedName) {
        for (const running of runningExes) {
          if (running.includes('uninstall') || running.includes('helper') || running.includes('crash') || running.includes('error') || running.includes('service')) continue
          if (running.includes('deadbydaylight') || running.includes('dead by daylight')) {
            detectedName = 'Dead by Daylight'
            detectedExe = running
            break
          }
          if (running.includes('gta5_enhanced') || running.includes('gtav_enhanced')) {
            detectedName = 'Grand Theft Auto V Enhanced'
            detectedExe = running
            break
          }
          if (running.includes('gta5') || running.includes('gtav') || running.includes('playgtav') || running.includes('fivem')) {
            detectedName = 'Grand Theft Auto V'
            detectedExe = running
            break
          }
          if (running.includes('rdr2') || running.includes('playrdr2')) {
            detectedName = 'Red Dead Redemption 2'
            detectedExe = running
            break
          }
        }
      }

      if (detectedName && detectedExe) {
        missCount = 0
        const isRL = detectedName === 'Rocket League'
        const gamePid = runningExePids.get(detectedExe) ?? 0

        // Priority 1: Game active
        if (!currentGame || currentGame.name !== detectedName) {
          console.log(`[ProcessMonitor] Detected game started: ${detectedName} (PID: ${gamePid}, binary: ${detectedExe})`)
          const startTime = Date.now()
          currentGame = { name: detectedName, exeName: detectedExe, startTime }
          currentGamePid = gamePid
          setActiveGameMetrics(detectedName)

          // Performance Mode: Pause all CSS animations and minimize if enabled
          if (appSettings.gamePerformanceMode !== false) {
            if (appSettings.autoMinimizeOnGame !== false) {
              try {
                if (mainWindow && !mainWindow.isMinimized() && mainWindow.isVisible()) {
                  mainWindow.minimize()
                }
              } catch (_) {}
            }
          }

          // Start real external FPS monitor ONLY if user actually enabled the performance overlay
          if (gamePid > 0 && appSettings.overlayPerformance) {
            startGameFpsMonitor(gamePid)
          }

          // Update Discord RPC
          if (appSettings.discordEnabled) {
            setDiscordActivity(detectedName, startTime, appSettings.discordPrivacyMode, appSettings.discordActivityStyle || 'clipping', undefined, undefined, undefined, undefined, undefined, appSettings.discordRpcAnimatedText ?? false)
          }

          // Start Roblox sub-game tracker if Roblox AND user has Discord & Roblox sub-game detection enabled
          const allowRobloxSubGame = appSettings.discordRpcRobloxSubGame !== false
          if (detectedName === 'Roblox') {
            if (allowRobloxSubGame && !robloxTrackerActive) {
              robloxTrackerActive = true
              startRobloxTracker((exp) => {
                if (!currentGame || currentGame.name !== 'Roblox') return
                const currentSettings = getAppSettings()
                if (currentSettings.discordRpcRobloxSubGame !== false && exp && exp.name) {
                  console.log(`[RobloxTracker] Active experience: ${exp.name} (Place: ${exp.placeId}, Universe: ${exp.universeId})`)
                  if (currentSettings.discordEnabled) {
                    setDiscordActivity(
                      exp.name,
                      startTime,
                      currentSettings.discordPrivacyMode,
                      currentSettings.discordActivityStyle || 'clipping',
                      undefined,
                      exp.iconUrl,
                      'in Roblox',
                      'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Roblox-Logo-Icon.png',
                      'Roblox',
                      currentSettings.discordRpcAnimatedText ?? false
                    )
                  }
                } else {
                  console.log(`[RobloxTracker] In Roblox Menu / No Experience`)
                  if (currentSettings.discordEnabled) {
                    setDiscordActivity(
                      'Roblox',
                      startTime,
                      currentSettings.discordPrivacyMode,
                      currentSettings.discordActivityStyle || 'clipping',
                      undefined,
                      undefined,
                      undefined,
                      undefined,
                      undefined,
                      currentSettings.discordRpcAnimatedText ?? false
                    )
                  }
                }
              })
            } else if (!allowRobloxSubGame && robloxTrackerActive) {
              robloxTrackerActive = false
              stopRobloxTracker()
            }
          } else if (detectedName !== 'Roblox' && robloxTrackerActive) {
            robloxTrackerActive = false
            stopRobloxTracker()
          }

          // Start RL service if Rocket League AND user has enabled it
          if (isRL && appSettings.overlayRLHud && !rlServiceActive) {
            rlServiceActive = true
            startRLService((rlData) => {
              const overlayWin = getOverlayWindow()
              overlayWin?.webContents.send('rl:mmr-update', rlData)
            }, (appSettings.rlPlaylist as any) || '2v2', appSettings.trnApiKey || '')
          } else if (!appSettings.overlayRLHud && rlServiceActive) {
            rlServiceActive = false
            stopRLService()
          }

          // Notify renderer
          mainWindow?.webContents.send('games:started', { 
            name: detectedName, 
            startTime,
            performanceMode: appSettings.gamePerformanceMode !== false 
          })
        } else if (currentGame.exeName !== detectedExe || (gamePid > 0 && currentGamePid !== gamePid)) {
          // SAME GAME, smoothly transitioned from launcher/bootstrap to main shipping binary
          console.log(`[ProcessMonitor] Game process transitioned: ${detectedName} (${currentGame.exeName} -> ${detectedExe}, PID: ${gamePid})`)
          currentGame.exeName = detectedExe
          if (gamePid > 0) currentGamePid = gamePid
          if (gamePid > 0 && appSettings.overlayPerformance) {
            startGameFpsMonitor(gamePid)
          }
        }

        // Check if overlay should be visible for active game
        const hasGeneralOverlay = appSettings.overlayPerformance || appSettings.overlayCrosshair || appSettings.overlayCps || appSettings.overlayController
        const hasActiveGameOverlay = hasGeneralOverlay || (detectedName === 'Roblox' && (appSettings.overlayRobloxTimer || appSettings.overlayRobloxCps)) || (isRL && (appSettings.overlayRLHud || appSettings.overlayRLSteam || appSettings.overlayRLController))

        if (hasActiveGameOverlay) {
          showOverlay({ 
            name: detectedName, 
            startTime: currentGame?.startTime || Date.now(), 
            positions: appSettings.overlayPositions,
            settings: {
              performance: appSettings.overlayPerformance,
              crosshair: appSettings.overlayCrosshair,
              cps: appSettings.overlayCps || (detectedName === 'Roblox' && appSettings.overlayRobloxCps),
              robloxCps: appSettings.overlayCps || (detectedName === 'Roblox' && appSettings.overlayRobloxCps),
              robloxTimer: appSettings.overlayRobloxTimer && detectedName === 'Roblox',
              rlHud: isRL && appSettings.overlayRLHud,
              overlayRLSteam: isRL && appSettings.overlayRLSteam,
              overlayController: appSettings.overlayController,
              overlayRLController: (isRL && appSettings.overlayRLController) || appSettings.overlayController,
              rlControllerSkin: appSettings.rlControllerSkin,
              rlControllerUrl: appSettings.rlControllerUrl,
              rlControllerScale: appSettings.rlControllerScale,
              metrics: appSettings.overlayMetrics,
              crosshairConfig: appSettings.crosshairConfig,
              steamProfileUrl: appSettings.steamProfileUrl,
              rlSteamAvatarScale: appSettings.rlSteamAvatarScale,
            }
          })
        } else {
          hideOverlay()
        }
      } else {
        // No game active
        if (currentGame) {
          missCount++
          // Grace period: allow 2 ticks (~4 seconds) for game processes transitioning
          if (missCount < 2) {
            return
          }
          missCount = 0
          console.log(`[ProcessMonitor] Detected game stopped: ${currentGame.name}`)
          try {
            const elapsedMins = Math.max(1, Math.round((Date.now() - (currentGame.startTime || Date.now())) / 60000))
            addPlaytimeRecord(currentGame.name, currentGame.name, elapsedMins)
          } catch (e) {
            console.error('[ProcessMonitor] Failed to record playtime on stop:', e)
          }

          // Stop RL service if it was running
          if (rlServiceActive) {
            rlServiceActive = false
            stopRLService()
          }

          // Stop Roblox tracker if it was running
          if (robloxTrackerActive) {
            robloxTrackerActive = false
            stopRobloxTracker()
          }

          // Restore normal process priority & 60 FPS frame rate
          try {
            os.setPriority(os.constants.priority.PRIORITY_NORMAL)
          } catch (_) {}
          mainWindow?.webContents.setFrameRate(60)

          if (appSettings.autoMinimizeOnGame !== false && appSettings.autoRestoreOnGameStop !== false) {
            try {
              if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
              }
            } catch (_) {}
          }

          currentGame = null
          currentGamePid = 0
          setActiveGameMetrics(null)
          stopGameFpsMonitor()
          mainWindow?.webContents.send('games:stopped')
        }

        // If user enabled "Always show general overlays on desktop", show only general overlays
        const hasGeneralOverlay = appSettings.overlayPerformance || appSettings.overlayCrosshair || appSettings.overlayCps || appSettings.overlayController
        if (appSettings.overlayGeneralAlwaysOn && hasGeneralOverlay) {
          showOverlay({
            name: 'Desktop',
            startTime: Date.now(),
            positions: appSettings.overlayPositions,
            settings: {
              performance: appSettings.overlayPerformance,
              crosshair: appSettings.overlayCrosshair,
              cps: appSettings.overlayCps,
              robloxCps: false,
              robloxTimer: false,
              rlHud: false,
              overlayRLSteam: false,
              overlayController: appSettings.overlayController,
              overlayRLController: appSettings.overlayController,
              rlControllerSkin: appSettings.rlControllerSkin,
              rlControllerUrl: appSettings.rlControllerUrl,
              rlControllerScale: appSettings.rlControllerScale,
              metrics: appSettings.overlayMetrics,
              crosshairConfig: appSettings.crosshairConfig,
              steamProfileUrl: appSettings.steamProfileUrl,
              rlSteamAvatarScale: appSettings.rlSteamAvatarScale,
            }
          })
        } else if (!currentGame) {
          hideOverlay()
        }

        if (!appSettings.discordEnabled && !appSettings.showIdle && !appSettings.showDownloads) {
          clearDiscordActivity()
          return
        }

        // Priority 2: Check for external downloads (Steam & Epic Games) ONLY if their client processes are running
        const isSteamRunning = runningExes.has('steam.exe')
        const isEpicRunning = runningExes.has('epicgameslauncher.exe')
        
        // THROTTLE download checking to every 15 seconds (5 ticks of 3s) to avoid synchronous disk-read freezing
        let activeExtDownload = null;
        if (appSettings.showDownloads) {
          downloadCheckTick++;
          if (downloadCheckTick >= 5) {
            downloadCheckTick = 0;
            const steamDownload = isSteamRunning ? checkSteamActiveDownloads() : null
            const epicDownload = isEpicRunning ? checkEpicActiveDownloads() : null
            activeExtDownload = steamDownload || epicDownload
            lastActiveDownload = activeExtDownload;
          } else {
            activeExtDownload = lastActiveDownload;
          }
        }

        if (activeExtDownload && appSettings.showDownloads) {
          // Send simplified Discord RPC
          setDiscordDownloadActivity(activeExtDownload.name, appSettings.discordRpcAnimatedText ?? false)
        } else if (appSettings.showIdle) {
          // Priority 3: Idle
          setDiscordIdleActivity(appSettings.discordRpcAnimatedText ?? false)
        } else {
          clearDiscordActivity()
        }
      }
    })
  }, 3000)

  // Trigger initial overlay sync immediately on startup
  setTimeout(() => {
    syncOverlaySettingsLive()
  }, 1000)
}

export function getCurrentDetectedGame() {
  return currentGame
}

export function resetCurrentDetectedGame() {
  if (currentGame) {
    console.log(`[ProcessMonitor] Manually resetting detected game: ${currentGame.name}`)
    try {
      const elapsedMins = Math.max(1, Math.round((Date.now() - (currentGame.startTime || Date.now())) / 60000))
      addPlaytimeRecord(currentGame.name, currentGame.name, elapsedMins)
    } catch {}
    if (rlServiceActive) {
      rlServiceActive = false
      stopRLService()
    }
    currentGame = null
    hideOverlay()
  }
}

export function syncOverlaySettingsLive() {
  invalidateSettingsCache()
  const appSettings = getAppSettings()
  const overlayWin = getOverlayWindow()
  const isRL = currentGame?.name === 'Rocket League'
  const hasGeneralOverlay = appSettings.overlayPerformance || appSettings.overlayCrosshair || appSettings.overlayCps || appSettings.overlayController

  const overlaySettings = {
    performance: appSettings.overlayPerformance,
    crosshair: appSettings.overlayCrosshair,
    cps: appSettings.overlayCps || (currentGame?.name === 'Roblox' && appSettings.overlayRobloxCps),
    robloxCps: appSettings.overlayCps || (currentGame?.name === 'Roblox' && appSettings.overlayRobloxCps),
    robloxTimer: appSettings.overlayRobloxTimer && currentGame?.name === 'Roblox',
    rlHud: isRL && appSettings.overlayRLHud,
    overlayRLSteam: isRL && appSettings.overlayRLSteam,
    overlayController: appSettings.overlayController,
    overlayRLController: (isRL && appSettings.overlayRLController) || appSettings.overlayController,
    rlControllerSkin: appSettings.rlControllerSkin,
    rlControllerUrl: appSettings.rlControllerUrl,
    rlControllerScale: appSettings.rlControllerScale,
    metrics: appSettings.overlayMetrics,
    crosshairConfig: appSettings.crosshairConfig,
    steamProfileUrl: appSettings.steamProfileUrl,
    rlSteamAvatarScale: appSettings.rlSteamAvatarScale,
  }

  // If overlay window is already open (e.g. edit mode or running), immediately push live settings
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('overlay:update', {
      name: currentGame?.name || 'Desktop',
      startTime: currentGame?.startTime || Date.now(),
      positions: appSettings.overlayPositions,
      settings: overlaySettings,
    })
  }

  if (currentGame) {
    const shouldShow = hasGeneralOverlay || (currentGame.name === 'Roblox' && (appSettings.overlayRobloxTimer || appSettings.overlayRobloxCps)) || (isRL && (appSettings.overlayRLHud || appSettings.overlayRLSteam || appSettings.overlayRLController))

    if (shouldShow) {
      showOverlay({
        name: currentGame.name,
        startTime: currentGame.startTime || Date.now(),
        positions: appSettings.overlayPositions,
        settings: overlaySettings,
      })
    } else if (!isEditModeActive()) {
      hideOverlay()
    }
  } else {
    if (appSettings.overlayGeneralAlwaysOn && hasGeneralOverlay) {
      showOverlay({
        name: 'Desktop',
        startTime: Date.now(),
        positions: appSettings.overlayPositions,
        settings: overlaySettings,
      })
    } else if (!isEditModeActive()) {
      hideOverlay()
    }
  }

  // Live Discord Activity refresh on settings change (e.g. toggled between Playing and Clipping or Roblox SubGame toggle)
  if (currentGame) {
    if (appSettings.discordEnabled) {
      if (currentGame.name === 'Roblox') {
        const { syncRobloxExperience, startRobloxTracker, stopRobloxTracker } = require('./robloxService')
        const allowSubGame = appSettings.discordRpcRobloxSubGame !== false

        if (allowSubGame) {
          if (!robloxTrackerActive) {
            robloxTrackerActive = true
            startRobloxTracker((exp: any) => {
              if (!currentGame || currentGame.name !== 'Roblox') return
              const currentSettings = getAppSettings()
              if (currentSettings.discordRpcRobloxSubGame !== false && exp && exp.name) {
                console.log(`[RobloxTracker] Active experience: ${exp.name} (Place: ${exp.placeId}, Universe: ${exp.universeId})`)
                if (currentSettings.discordEnabled) {
                  setDiscordActivity(
                    exp.name,
                    currentGame.startTime,
                    currentSettings.discordPrivacyMode,
                    currentSettings.discordActivityStyle || 'clipping',
                    undefined,
                    exp.iconUrl,
                    'in Roblox',
                    'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Roblox-Logo-Icon.png',
                    'Roblox',
                    currentSettings.discordRpcAnimatedText ?? false
                  )
                }
              } else {
                console.log(`[RobloxTracker] In Roblox Menu / No Experience`)
                if (currentSettings.discordEnabled) {
                  setDiscordActivity(
                    'Roblox',
                    currentGame.startTime,
                    currentSettings.discordPrivacyMode,
                    currentSettings.discordActivityStyle || 'clipping',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    currentSettings.discordRpcAnimatedText ?? false
                  )
                }
              }
            })
          }

          // Immediately sync and apply active experience
          syncRobloxExperience().then((exp: any) => {
            if (!currentGame || currentGame.name !== 'Roblox') return
            if (exp && exp.name) {
              setDiscordActivity(
                exp.name,
                currentGame.startTime,
                appSettings.discordPrivacyMode,
                appSettings.discordActivityStyle || 'clipping',
                undefined,
                exp.iconUrl,
                'in Roblox',
                'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Roblox-Logo-Icon.png',
                'Roblox',
                appSettings.discordRpcAnimatedText ?? false
              )
            } else {
              setDiscordActivity(
                'Roblox',
                currentGame.startTime,
                appSettings.discordPrivacyMode,
                appSettings.discordActivityStyle || 'clipping',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                appSettings.discordRpcAnimatedText ?? false
              )
            }
          }).catch(() => {})
        } else {
          if (robloxTrackerActive) {
            robloxTrackerActive = false
            stopRobloxTracker()
          }
          setDiscordActivity(
            'Roblox',
            currentGame.startTime,
            appSettings.discordPrivacyMode,
            appSettings.discordActivityStyle || 'clipping',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            appSettings.discordRpcAnimatedText ?? false
          )
        }
      } else {
        setDiscordActivity(
          currentGame.name,
          currentGame.startTime,
          appSettings.discordPrivacyMode,
          appSettings.discordActivityStyle || 'clipping',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          appSettings.discordRpcAnimatedText ?? false
        )
      }
    } else if (appSettings.showIdle) {
      setDiscordIdleActivity(appSettings.discordRpcAnimatedText ?? false)
    } else {
      clearDiscordActivity()
    }
  } else {
    // If no game is running, immediately update Idle activity state
    if (appSettings.showIdle) {
      setDiscordIdleActivity(appSettings.discordRpcAnimatedText ?? false)
    } else {
      clearDiscordActivity()
    }
  }
}


