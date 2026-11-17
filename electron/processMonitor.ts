import { exec, execFile } from 'child_process'
import { BrowserWindow, app } from 'electron'
import { setDiscordActivity, setDiscordIdleActivity, setDiscordDownloadActivity, clearDiscordActivity, refreshDiscordActivity, setDiscordEnabled, setDiscordVersionVisible } from './discordRPC'
import { SteamDownloadMonitor, type DownloadActivity } from './steamDownloadActivity'
import { normalizeDiscordSettings, mergeDiscordSettings, discordPresenceMode } from './discordPresence'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { showOverlay, hideOverlay, getOverlayWindow } from './overlayManager'
import { buildOverlayData } from './overlayState'
import { startRLService, stopRLService, configureRLService, type RLPlaylist } from './rlService'
import { addPlaytimeRecord } from './playtimeService'
import { stopGameFpsMonitor } from './gameFpsService'
import { startRobloxTracker, stopRobloxTracker, flushRobloxExperiencePlaytime } from './robloxService'
import { onGameStartedAutoClip, onGameStoppedAutoClip } from './autoClipService'
import { startRobloxAntiAfk, stopRobloxAntiAfk } from './robloxAntiAfkService'
import { requestMemoryRelief } from './memoryOptimizerService'
import { updateTrayMenu } from './main'
import { clipsModeSettings, type AppMode } from '../src/services/appMode'
let clipsOnly = false
export function setProcessMonitorMode(mode: AppMode) { clipsOnly = mode === 'clips'; invalidateSettingsCache() }
import { NON_STEAM_GAMES, getNonSteamGame } from '../src/services/nonSteamGames'
import { executableName, identifyGameProcess, parseProcessSnapshot, selectGameProcess } from './gameDetection'
import { discoverRiotGames, epicManifestDirectory, insideInstallation } from './nonSteamDiscovery'

interface ActiveDetectedGame {
  name: string
  exeName: string
  startTime: number
}

// ─── Roblox Process & Window Verification ──────────────────────────────────
// Roblox frequently leaves headless background worker/telemetry processes running
// after the game window is closed. These helper functions distinguish active GUI
// Roblox gameplay from stale/windowless background processes.

export const ROBLOX_GAME_EXES = new Set([
  'robloxplayerbeta.exe',
  'robloxplayerlauncher.exe',
  'roblox.exe',
  'windows10universal.exe',
  'bloxstrap.exe'
])

export function isRobloxCandidateExe(exe: string): boolean {
  if (!exe) return false
  const lower = exe.toLowerCase().trim()
  if (ROBLOX_GAME_EXES.has(lower)) return true
  if ((lower.includes('roblox') || lower.includes('bloxstrap')) &&
      !lower.includes('studio') &&
      !lower.includes('installer') &&
      !lower.includes('crash') &&
      !lower.includes('helper')) {
    return true
  }
  return false
}

export function isRobloxGame(name?: string, exe?: string): boolean {
  const n = (name || '').toLowerCase().trim()
  const e = (exe || '').toLowerCase().trim()
  return n === 'roblox' || n.includes('roblox') || isRobloxCandidateExe(e)
}

export function isNoWindowPlaceholder(title: string): boolean {
  if (!title) return true
  const t = title.trim().toLowerCase()
  if (
    t === '' ||
    t === 'n/a' ||
    t === 'nicht zutreffend' ||
    t === 'n/d' ||
    t === 'n.d.' ||
    t === 'nie dotyczy' ||
    t === 'н/д' ||
    t === 'geen' ||
    t === 'unknown' ||
    t === 'não aplicável' ||
    t === 'brak' ||
    t === 'non disponible' ||
    t === 'olemainthreadwndname' ||
    t === 'default ime' ||
    t === 'msctfime ui' ||
    t === 'gdi+ window'
  ) {
    return true
  }
  return false
}

export function isRobloxActiveWindowTitle(title: string): boolean {
  if (!title || isNoWindowPlaceholder(title)) return false
  const t = title.trim().toLowerCase()
  if (t.includes('installer') || t.includes('crash') || t.includes('setup') || t.includes('update') || t.includes('helper') || t.includes('unins')) {
    return false
  }
  return t.includes('roblox') || t.length > 0
}

export async function verifyRobloxActiveWindow(candidateExes: string[]): Promise<{ hasActiveWindow: boolean; activePid: number; activeExe: string }> {
  for (const exe of candidateExes) {
    try {
      const stdout = await new Promise<string>((resolve) => {
        execFile('tasklist.exe', ['/FI', `IMAGENAME eq ${exe}`, '/V', '/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 1024 * 512 }, (err, out) => {
          if (err || !out) resolve('')
          else resolve(out)
        })
      })

      if (!stdout) continue

      const lines = stdout.split(/\r?\n/)
      for (const line of lines) {
        if (!line.trim()) continue
        // CSV: "name.exe","PID","session","session#","mem usage","status","user","cpu","window title"
        const parts = line.match(/"([^"]*)"/g)
        if (parts && parts.length >= 9) {
          const m = parts.map(s => s.slice(1, -1))
          const pid = parseInt(m[1], 10)
          const title = m[8]
          if (!isNaN(pid) && isRobloxActiveWindowTitle(title)) {
            return { hasActiveWindow: true, activePid: pid, activeExe: exe }
          }
        }
      }
    } catch (_) {}
  }
  return { hasActiveWindow: false, activePid: 0, activeExe: '' }
}

// Helper to read user Discord RPC and Overlay settings with in-memory caching
let cachedSettings: any = null
let lastSettingsRead = 0
let robloxTrackerActive = false
let lastActiveRobloxExperience: any = null

function updateRobloxDiscordActivity(exp: { name: string; placeId: string; universeId: string; iconUrl?: string } | null) {
  if (!currentGame || !isRobloxGame(currentGame.name, currentGame.exeName)) return
  lastActiveRobloxExperience = exp?.name && exp.name !== 'Roblox Experience' ? exp : null
  syncDiscordPresence()
}

export function getLastActiveRobloxExperience() {
  return lastActiveRobloxExperience
}

export function invalidateSettingsCache() {
  cachedSettings = null
  lastSettingsRead = 0
}

export function updateSettingsInMemory(settings: any) {
  if (!settings) return
  if (clipsOnly) settings = clipsModeSettings(settings)
  if (!cachedSettings) {
    getAppSettings()
  }
  const discord = mergeDiscordSettings(cachedSettings || {}, settings)
  cachedSettings = {
    ...cachedSettings,
    ...settings,
    ...discord,
    discordRpc: discord.discordEnabled,
    discordRpcIdle: discord.showIdle,
    discordRpcShowDownloads: discord.showDownloads,
    discordRpcPrivacyMode: discord.discordPrivacyMode,
    overlayPositions: settings.overlayPositions ?? cachedSettings?.overlayPositions,
    overlayMetrics: settings.overlayMetrics ?? cachedSettings?.overlayMetrics,
    crosshairConfig: settings.crosshairConfig !== undefined ? settings.crosshairConfig : cachedSettings?.crosshairConfig,
  }
  lastSettingsRead = Date.now()
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
        autoMinimizeOnGame: s.autoMinimizeOnGame ?? false,
        autoRestoreOnGameStop: s.autoRestoreOnGameStop ?? true,
        discordEnabled: s.discordRpc ?? true,
        discordActivityStyle: s.discordActivityStyle || s.discordRpcActivityStyle || 'clipping',
        discordPrivacyMode: s.discordRpcPrivacyMode ?? false,
        discordRpcRobloxSubGame: s.discordRpcRobloxSubGame ?? true,
        discordRpcAnimatedText: s.discordRpcAnimatedText ?? false,
        discordRpcShowVersion: s.discordRpcShowVersion === true,
        showDownloads: s.discordRpcShowDownloads ?? true,
        showIdle: s.discordRpcIdle ?? true,
        overlayPerformance: s.overlayPerformance ?? false,
        overlayCrosshair: s.overlayCrosshair ?? false,
        overlayGeneralAlwaysOn: s.overlayGeneralAlwaysOn === true,
        overlayCps: s.overlayCps ?? false,
        overlayController: s.overlayController ?? false,
        overlayMedia: s.overlayMedia ?? false,
        overlayMediaSource: s.overlayMediaSource ?? 'all',
        overlayMediaAutoHide: s.overlayMediaAutoHide ?? false,
        overlayMediaVisualizer: s.overlayMediaVisualizer !== false,
        overlayRobloxTimer: s.overlayRobloxTimer ?? false,
        overlayRobloxCps: s.overlayRobloxCps ?? false,
        overlayRobloxAntiAfk: s.overlayRobloxAntiAfk ?? false,
        overlayControllerStreamOnly: s.overlayControllerStreamOnly ?? false,
        overlayRLHud: s.overlayRLHud ?? false,
        overlayRLSteam: s.overlayRLSteam ?? false,
        overlayRLController: s.overlayRLController ?? false,
        rlPlaylist: s.rlPlaylist ?? '2v2',
        rlPlayerId: typeof s.rlPlayerId === 'string' ? s.rlPlayerId : '',
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
      if (clipsOnly) cachedSettings = clipsModeSettings(cachedSettings)
      return cachedSettings
    }
  } catch (e) {}

  cachedSettings = {
    autoMinimizeOnGame: false,
    autoRestoreOnGameStop: true,
    discordEnabled: true, discordActivityStyle: 'clipping', discordPrivacyMode: false, showDownloads: true, showIdle: true,
    overlayPerformance: false, overlayCrosshair: false, overlayGeneralAlwaysOn: false,
    overlayCps: false, overlayController: false, overlayControllerStreamOnly: false, overlayMedia: false, overlayMediaSource: 'all' as const, overlayMediaAutoHide: false, overlayMediaVisualizer: true, overlayRobloxTimer: false, overlayRobloxCps: false, overlayRobloxAntiAfk: false,
    overlayRLHud: false, overlayRLSteam: false, overlayRLController: false, rlPlaylist: '2v2' as const, rlPlayerId: '', trnApiKey: '',
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
  'roblox.exe': 'Roblox',
  'windows10universal.exe': 'Roblox',
  'bloxstrap.exe': 'Roblox',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'valorant-win64-shipping.exe': 'VALORANT',
  'leagueclient.exe': 'League of Legends',
  'league of legends.exe': 'League of Legends',
  'minecraftlauncher.exe': 'Minecraft',
  'minecraft.exe': 'Minecraft',
  'rocketleague.exe': 'Rocket League',
  'cs2.exe': 'Counter-Strike 2',
  'csgo.exe': 'Counter-Strike: Global Offensive',
  'dota2.exe': 'Dota 2',
  'hl2.exe': 'Garry\'s Mod',
  'gmod.exe': 'Garry\'s Mod',
  'left4dead2.exe': 'Left 4 Dead 2',
  'tf.exe': 'Team Fortress 2',
  'tf_win64.exe': 'Team Fortress 2',
  'rainbowsix.exe': 'Tom Clancy\'s Rainbow Six Siege',
  'rainbowsix_vulkan.exe': 'Tom Clancy\'s Rainbow Six Siege',
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'eldenring.exe': 'Elden Ring',
  'apex.exe': 'Apex Legends',
  'r5apex.exe': 'Apex Legends',
  'rustclient.exe': 'Rust',
  'dayz_x64.exe': 'DayZ',
  'cod.exe': 'Call of Duty',
  'destiny2.exe': 'Destiny 2',
  'warframe.x64.exe': 'Warframe',
  'overwatch.exe': 'Overwatch 2',
  'genshinimpact.exe': 'Genshin Impact',
  'yuanshen.exe': 'Genshin Impact',
  'starrail.exe': 'Honkai: Star Rail',
  'zenlesszonezero.exe': 'Zenless Zone Zero',
  'fallguys_client_game.exe': 'Fall Guys',
  'palworld-win64-shipping.exe': 'Palworld',
  'helldivers2.exe': 'Helldivers 2',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'witcher3.exe': 'The Witcher 3: Wild Hunt',
  'fc24.exe': 'EA SPORTS FC 24',
  'fc25.exe': 'EA SPORTS FC 25',
  'fifa23.exe': 'FIFA 23',
  'beamng.drive.x64.exe': 'BeamNG.drive',
  'beamng.drive.exe': 'BeamNG.drive',
  'acs.exe': 'Assetto Corsa',
  'assettocorsa.exe': 'Assetto Corsa',
  'forzahorizon5.exe': 'Forza Horizon 5',
  'forzahorizon4.exe': 'Forza Horizon 4',
  'eurotrucks2.exe': 'Euro Truck Simulator 2',
  'terraria.exe': 'Terraria',
  'lethal company.exe': 'Lethal Company',
  'among us.exe': 'Among Us',
  'phasmophobia.exe': 'Phasmophobia',
  'repo.exe': 'R.E.P.O.',
  'bodycam-win64-shipping.exe': 'Bodycam',
  'bodycam.exe': 'Bodycam',
  'content warning.exe': 'Content Warning',
  'isaac-ng.exe': 'The Binding of Isaac: Rebirth',
  'hades.exe': 'Hades',
  'hades2.exe': 'Hades II',
  'geometrydash.exe': 'Geometry Dash',
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
const gameSteamIds = new Map<string, number>()
const gameNameKey = (name: string) => name.normalize('NFKC').replace(/[™®©]/g, '').toLowerCase().trim()

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

export function registerGameExe(exeName: string, gameName: string, steamId?: number, fallbackOnly = false): boolean {
  if (typeof exeName !== 'string' || typeof gameName !== 'string' || !gameName.trim() || exeName.length > 2048 || gameName.length > 256) return false
  const cleanExe = executableName(exeName)
  if (cleanExe.endsWith('.exe') && !isIgnoredExe(cleanExe)) {
    if (fallbackOnly && (customGameExes[cleanExe] || KNOWN_GAME_EXES[cleanExe])) return false
    customGameExes[cleanExe] = gameName.trim()
    if (Number.isSafeInteger(steamId) && steamId! > 0 && !getNonSteamGame(gameName)) gameSteamIds.set(gameNameKey(gameName), steamId!)
    return true
  }
  return false
}

export function registerInstalledGameRecords(records: unknown): number {
  if (!Array.isArray(records) || records.length > 2048) throw new Error('Invalid installed game registry')
  let registered = 0
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.executable !== 'string' || record.executable.includes('://')) continue
    if (!/\.exe$/i.test(record.executable) || typeof record.name !== 'string') continue
    if (registerGameExe(record.executable, record.name, record.steamId)) registered++
  }
  return registered
}

let cachedSteamPathSync: string | null = null;
let hasCheckedSteamPath = false;

// Helper to get steam installation path from registry (Cached)
function getSteamPathSync(): string | null {
  if (hasCheckedSteamPath) return cachedSteamPathSync;
  hasCheckedSteamPath = true;
  try {
    const stdout = require('child_process').execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8', windowsHide: true, timeout: 3000 })
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

let steamDownloadRootRetryAt = 0
async function downloadSteamPath(): Promise<string | null> {
  if (cachedSteamPathSync) return cachedSteamPathSync
  if (Date.now() < steamDownloadRootRetryAt) return null
  steamDownloadRootRetryAt = Date.now() + 60_000
  return new Promise(resolve => execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8', windowsHide: true, timeout: 3000 }, (error, stdout) => {
    const found = !error && /SteamPath\s+REG_SZ\s+(.*)/i.exec(String(stdout))
    if (found) cachedSteamPathSync = found[1].trim().replace(/\//g, '\\')
    resolve(cachedSteamPathSync)
  }))
}

// Real-time Epic Games Download Monitor (Simplified)
async function checkEpicActiveDownloads(): Promise<DownloadActivity | null> {
  const epicManifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

  try {
    // 1. Check Pending folder first
    const pendingDir = path.join(epicManifestDir, 'Pending')
    if (await fs.promises.stat(pendingDir).then(info => info.isDirectory(), () => false)) {
      const pendingFiles = (await fs.promises.readdir(pendingDir)).filter(f => f.endsWith('.item'))
      for (const file of pendingFiles) {
        try {
          const filePath = path.join(pendingDir, file)
          const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
          const name = data.DisplayName || data.AppName
          if (name) return { name, source: 'Epic Games', phase: 'download' }
        } catch (e) {}
      }
    }

    // 2. Check main Manifests directory for incomplete installs
    const files = (await fs.promises.readdir(epicManifestDir)).filter(f => f.endsWith('.item'))
    for (const file of files) {
      try {
        const filePath = path.join(epicManifestDir, file)
        const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
        if (data.bIsIncompleteInstall || data.bIsDownload || data.bIsUpdating) {
          const name = data.DisplayName || data.AppName
          if (name) return { name, source: 'Epic Games', phase: 'download' }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null
}


async function findGameExesFast(gameDir: string, shouldContinue: () => boolean, depth = 0): Promise<string[]> {
  if (depth > 4 || !shouldContinue()) return []
  const found: string[] = []
  try {
    const entries = await fs.promises.readdir(gameDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!shouldContinue()) break
      const lower = entry.name.toLowerCase()
      if (entry.isFile() && lower.endsWith('.exe')) {
        if (!isIgnoredExe(lower)) found.push(lower)
      } else if (entry.isDirectory()) {
        if (!['directx', '_commonredist', 'redist', 'support', 'installer', 'mono', 'dotnet', 'burstdebug', '_burst', 'shader', 'logs', 'extras', 'plugins'].some(k => lower.includes(k))) {
          found.push(...await findGameExesFast(path.join(gameDir, entry.name), shouldContinue, depth + 1))
        }
      }
    }
  } catch (_) {}
  return found
}

export async function autoScanInstalledGames(shouldContinue: () => boolean = () => true): Promise<void> {
  try {
    if (!hasCheckedSteamPath) {
      hasCheckedSteamPath = true
      const output = await new Promise<string>(resolve => execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 3000 }, (error, stdout) => resolve(error ? '' : stdout)))
      cachedSteamPathSync = /SteamPath\s+REG_SZ\s+(.+)/i.exec(output)?.[1].trim().replace(/\//g, '\\') || null
    }
    const steamPath = cachedSteamPathSync
    if (!shouldContinue()) return
    if (steamPath) {
      const folders = getSteamLibraryFolders(steamPath)
      for (const folder of folders) {
        if (!shouldContinue()) return
        const steamappsPath = path.join(folder, 'steamapps')
        try {
          const manifests = (await fs.promises.readdir(steamappsPath)).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))
          for (const manifest of manifests) {
            if (!shouldContinue()) return
            const acfPath = path.join(steamappsPath, manifest)
            const content = await fs.promises.readFile(acfPath, 'utf-8')
            const name = extractAcfField(content, 'name')
            const installdir = extractAcfField(content, 'installdir')
            if (name && installdir) {
              const gameCommonPath = path.join(steamappsPath, 'common', installdir)
              {
                const exes = await findGameExesFast(gameCommonPath, shouldContinue)
                for (const exe of exes) {
                  if (!shouldContinue()) return
                  registerGameExe(exe, name, Number(/appmanifest_(\d+)\.acf/i.exec(manifest)?.[1]))
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
    const epicManifestDir = await epicManifestDirectory()
    if (epicManifestDir && shouldContinue()) {
      const files = (await fs.promises.readdir(epicManifestDir)).filter(f => f.endsWith('.item'))
      for (const file of files) {
        if (!shouldContinue()) return
        try {
          const filePath = path.join(epicManifestDir, file)
          const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
          const name = data.DisplayName || data.AppName
          const exe = data.LaunchExecutable
          if (name && exe && exe.toLowerCase().endsWith('.exe')) {
            registerGameExe(exe, name)
            if (typeof data.InstallLocation === 'string') {
              const launchPath = insideInstallation(data.InstallLocation, exe)
              if (launchPath) {
                for (const sibling of await findGameExesFast(path.dirname(launchPath), shouldContinue)) {
                  if (!shouldContinue()) return
                  registerGameExe(sibling, name)
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  for (const game of await discoverRiotGames(shouldContinue)) {
    if (!shouldContinue()) return
    if (game.executable) registerGameExe(game.executable, game.name)
  }
}

let currentGame: ActiveDetectedGame | null = null
let currentGamePid: number = 0
let missCount = 0
let monitorInterval: NodeJS.Timeout | null = null
let rlServiceActive = false
let getMonitorWindow: () => BrowserWindow | null = () => null
function syncRLHud(settings: { overlayRLHud?: boolean; rlPlaylist?: string; rlPlayerId?: string }) {
  configureRLService({ rlPlaylist: settings.rlPlaylist as RLPlaylist, rlPlayerId: settings.rlPlayerId })
  if (currentGame?.name === 'Rocket League' && settings.overlayRLHud) {
    if (!rlServiceActive) {
      rlServiceActive = true
      startRLService(data => {
        for (const window of new Set([getMonitorWindow(), getOverlayWindow()])) {
          if (window && !window.isDestroyed()) window.webContents.send('rl:mmr-update', data)
        }
      }, settings.rlPlaylist as RLPlaylist)
    }
  } else if (rlServiceActive) { rlServiceActive = false; stopRLService() }
}
let lastLibraryScanTime = 0
let lastDownloadCheck = 0
let lastActiveDownload: DownloadActivity | null = null
let downloadClients = { steam: false, epic: false }
let steamActivityRefreshTimer: ReturnType<typeof setTimeout> | undefined
const steamDownloads = new SteamDownloadMonitor(() => {
  if (steamActivityRefreshTimer) return
  steamActivityRefreshTimer = setTimeout(() => {
    steamActivityRefreshTimer = undefined
    const settings = getAppSettings()
    if (downloadClients.steam && settings.discordEnabled && settings.showDownloads && !currentGame) refreshExternalDownloads(downloadClients.steam, downloadClients.epic, monitorGeneration)
  }, 500)
  steamActivityRefreshTimer.unref?.()
})
let downloadScanInProgress = false, downloadScanRevision = 0
let launcherDownloadName: string | null = null

function refreshExternalDownloads(steam: boolean, epic: boolean, generation: number) {
  if (downloadScanInProgress) return
  downloadScanInProgress = true; lastDownloadCheck = Date.now()
  const revision = ++downloadScanRevision
  void Promise.all([
    steam ? downloadSteamPath().then(root => root ? steamDownloads.scan(root) : null) : Promise.resolve(null),
    epic ? checkEpicActiveDownloads() : Promise.resolve(null),
  ]).then(([steamActivity, epicActivity]) => {
    if (generation !== monitorGeneration || revision !== downloadScanRevision) return
    lastActiveDownload = steamActivity || epicActivity; lastDownloadCheck = Date.now(); syncDiscordPresence()
  }).catch(() => { if (revision === downloadScanRevision) lastActiveDownload = null })
    .finally(() => { downloadScanInProgress = false })
}

export function setLauncherDownloadActivity(name: unknown) {
  launcherDownloadName = typeof name === 'string' && name.trim() ? name.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 128) : null
  syncDiscordPresence()
}

export function syncDiscordPresence() {
  const settings = normalizeDiscordSettings(getAppSettings())
  setDiscordEnabled(settings.discordEnabled)
  setDiscordVersionVisible(settings.discordRpcShowVersion)
  const download = launcherDownloadName || (Date.now() - lastDownloadCheck < 20_000 ? lastActiveDownload?.name : undefined)
  const mode = discordPresenceMode(settings, currentGame, download)
  if (mode === 'off') { clearDiscordActivity(); return }
  if (mode === 'download') { setDiscordDownloadActivity(download!, settings.discordRpcAnimatedText, launcherDownloadName ? { name: launcherDownloadName, source: 'Eclipse', phase: 'download' } : lastActiveDownload || undefined, settings.discordPrivacyMode); return }
  if (mode === 'idle') { setDiscordIdleActivity(settings.discordRpcAnimatedText, clipsOnly); return }
  if (!currentGame) return
  const roblox = isRobloxGame(currentGame.name, currentGame.exeName)
  const experience = roblox && settings.discordRpcRobloxSubGame ? lastActiveRobloxExperience : null
  setDiscordActivity(
    experience?.name || currentGame.name, currentGame.startTime,
    settings.discordPrivacyMode, settings.discordActivityStyle,
    gameSteamIds.get(gameNameKey(currentGame.name)), experience?.iconUrl || (roblox ? 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/Roblox-Logo-Icon.png' : undefined),
    experience ? 'in Roblox' : undefined,
    undefined, undefined, settings.discordRpcAnimatedText, currentGamePid,
  )
}

export function isAnyGameRunning(): boolean {
  return currentGame !== null
}

export function isRobloxRunning(): boolean {
  if (currentGame && isRobloxGame(currentGame.name, currentGame.exeName)) {
    return true
  }
  return false
}

let isProcessScanInProgress = false
let monitorGeneration = 0
let previousRunningExes = new Set<string>()

function persistCurrentSession(): void {
  if (!currentGame) return
  const minutes = Math.max(0, (Date.now() - currentGame.startTime) / 60000)
  const isRoblox = isRobloxGame(currentGame.name, currentGame.exeName)
  addPlaytimeRecord(isRoblox ? 'roblox' : currentGame.name, currentGame.name, minutes, isRoblox ? 999001 : undefined)
  if (isRoblox) flushRobloxExperiencePlaytime()
}

export function startProcessMonitor(getMainWindow: () => BrowserWindow | null) {
  getMonitorWindow = getMainWindow
  if (monitorInterval) return
  const generation = ++monitorGeneration

  // Discovery yields on filesystem I/O so Windows can keep handling the window.
  void autoScanInstalledGames(() => generation === monitorGeneration)

  monitorInterval = setInterval(async () => {
    if (process.platform !== 'win32') return
    if (isProcessScanInProgress) return
    isProcessScanInProgress = true

    const appSettings = getAppSettings()
    const mainWindow = getMainWindow()

    // Run Windows tasklist directly without cmd.exe intermediary (hidden, zero console window)
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, async (err, stdout) => {
      try {
        if (err || generation !== monitorGeneration) return
        const processes = parseProcessSnapshot(stdout || '')
        // A malformed or incomplete command response is not evidence of a game exit.
        if (stdout?.trim() && processes.size === 0) return
        let runningExes = new Set(processes.keys())
        const runningExePids = new Map<string, number>()
        for (const [exe, pids] of processes) {
          runningExePids.set(exe, pids.includes(currentGamePid) ? currentGamePid : pids[0])
        }

        // Roblox Background Process Blacklisting & Window Verification:
        // When Roblox is closed, it frequently leaves hanging background processes (e.g. RobloxPlayerBeta.exe, Bloxstrap)
        // in Task Manager without a visible window. Filter out any Roblox candidate that lacks an active GUI window.
        const robloxCandidates = Array.from(runningExes).filter(e => isRobloxCandidateExe(e))
        if (robloxCandidates.length > 0) {
          const robloxWindowInfo = await verifyRobloxActiveWindow(robloxCandidates)
          if (generation !== monitorGeneration) return
          if (!robloxWindowInfo.hasActiveWindow) {
            // No active Roblox window found - all detected Roblox processes are purely background/headless!
            for (const cand of robloxCandidates) {
              runningExes.delete(cand)
              runningExePids.delete(cand)
            }
            if (currentGame && isRobloxGame(currentGame.name, currentGame.exeName)) {
              console.log(`[ProcessMonitor] Active Roblox window not visible (PID ${currentGamePid}); waiting for grace period.`)
            }
          } else {
            // Verified active Roblox game window exists! Ensure active PID is set
            runningExePids.set(robloxWindowInfo.activeExe, robloxWindowInfo.activePid)
          }
        }

      // Combine known games + custom scanned games
      const allExes = { ...KNOWN_GAME_EXES, ...customGameExes }
      for (const game of NON_STEAM_GAMES) {
        for (const exe of [...game.processes, ...game.bootstrap || []]) allExes[exe] = game.name
      }
      
      const foundGames: Array<{ name: string; exe: string; pid: number; bootstrap?: boolean }> = []

      for (const [exe, name] of Object.entries(allExes)) {
        if (isIgnoredExe(exe)) continue
        const identity = identifyGameProcess(exe, name)
        if (identity && runningExes.has(exe)) {
          foundGames.push({
            ...identity,
            exe,
            pid: runningExePids.get(exe) ?? 0
          })
        }
      }

      // Heuristic fallback for modded or variantly named executables
      if (foundGames.length === 0) {
        for (const running of runningExes) {
          if (running.includes('uninstall') || running.includes('helper') || running.includes('crash') || running.includes('error') || running.includes('service')) continue
          if (running.includes('deadbydaylight') || running.includes('dead by daylight')) {
            foundGames.push({ name: 'Dead by Daylight', exe: running, pid: runningExePids.get(running) ?? 0 })
            break
          }
          if (running.includes('gta5_enhanced') || running.includes('gtav_enhanced')) {
            foundGames.push({ name: 'Grand Theft Auto V Enhanced', exe: running, pid: runningExePids.get(running) ?? 0 })
            break
          }
          if (running.includes('gta5') || running.includes('gtav') || running.includes('playgtav') || running.includes('fivem')) {
            foundGames.push({ name: 'Grand Theft Auto V', exe: running, pid: runningExePids.get(running) ?? 0 })
            break
          }
          if (running.includes('rdr2') || running.includes('playrdr2')) {
            foundGames.push({ name: 'Red Dead Redemption 2', exe: running, pid: runningExePids.get(running) ?? 0 })
            break
          }
          if ((running.includes('roblox') || running.includes('bloxstrap')) && !runningExes.has('robloxcrashhandler.exe')) {
            if (!running.includes('studio') && !running.includes('installer') && !running.includes('crash')) {
              foundGames.push({ name: 'Roblox', exe: running, pid: runningExePids.get(running) ?? 0 })
              break
            }
          }
          if (running.includes('rocketleague') || running.includes('rocket league')) {
            foundGames.push({ name: 'Rocket League', exe: running, pid: runningExePids.get(running) ?? 0 })
            break
          }
        }
      }

      let detectedName: string | null = null
      let detectedExe: string | null = null

      const selected = selectGameProcess(foundGames, previousRunningExes, currentGame, currentGamePid, Date.now())
      if (selected) { detectedName = selected.name; detectedExe = selected.exe }
      previousRunningExes = runningExes

      if (detectedName && detectedExe) {
        missCount = 0
        const isRL = detectedName === 'Rocket League'
        const gamePid = runningExePids.get(detectedExe) ?? 0

        // Priority 1: Game active
        if (!currentGame || currentGame.name !== detectedName) {
          if (currentGame) {
            console.log(`[ProcessMonitor] Game switched from ${currentGame.name} to ${detectedName} (PID: ${gamePid})`)
            try {
              persistCurrentSession()
            } catch (_) {}
            if (robloxTrackerActive) {
              robloxTrackerActive = false
              stopRobloxTracker(updateRobloxDiscordActivity)
            }
            lastActiveRobloxExperience = null
            stopRobloxAntiAfk()
            if (rlServiceActive) {
              rlServiceActive = false
              stopRLService()
            }
            onGameStoppedAutoClip()
          }
          console.log(`[ProcessMonitor] Detected game started: ${detectedName} (PID: ${gamePid}, binary: ${detectedExe})`)
          const startTime = Date.now()
          currentGame = { name: detectedName, exeName: detectedExe, startTime }
          currentGamePid = gamePid

          // Auto-minimize on game start ONLY if explicitly configured
          if (appSettings.autoMinimizeOnGame === true) {
            try {
              if (mainWindow && !mainWindow.isMinimized() && mainWindow.isVisible()) {
                mainWindow.minimize()
              }
            } catch (_) {}
          }


          // Start Smart Auto-Clipping event watcher for detected game
          onGameStartedAutoClip(detectedName)


          // Start Roblox sub-game tracker if Roblox AND user has Discord & Roblox sub-game detection enabled
          const isRoblox = isRobloxGame(detectedName, detectedExe)
          const allowRobloxSubGame = appSettings.discordEnabled && appSettings.discordRpcRobloxSubGame !== false

          if (isRoblox) {
            if (allowRobloxSubGame && !robloxTrackerActive) {
              robloxTrackerActive = true
              startRobloxTracker(updateRobloxDiscordActivity)
            } else if (!allowRobloxSubGame && robloxTrackerActive) {
              robloxTrackerActive = false
              stopRobloxTracker(updateRobloxDiscordActivity)
            }
          } else if (!isRoblox && robloxTrackerActive) {
            robloxTrackerActive = false
            stopRobloxTracker(updateRobloxDiscordActivity)
          }

          // Roblox Anti-AFK (1-pixel micro nudge)
          if (isRoblox) {
            if (appSettings.overlayRobloxAntiAfk) {
              startRobloxAntiAfk()
            } else {
              stopRobloxAntiAfk()
            }
          } else {
            stopRobloxAntiAfk()
          }

          // Notify renderer
          mainWindow?.webContents.send('games:started', { 
            name: detectedName, 
            startTime,
          })

          requestMemoryRelief()
        } else if (currentGame.exeName !== detectedExe || (gamePid > 0 && currentGamePid !== gamePid)) {
          // SAME GAME, smoothly transitioned from launcher/bootstrap to main shipping binary
          console.log(`[ProcessMonitor] Game process transitioned: ${detectedName} (${currentGame.exeName} -> ${detectedExe}, PID: ${gamePid})`)
          currentGame.exeName = detectedExe
          if (gamePid > 0) currentGamePid = gamePid

          const isRoblox = isRobloxGame(currentGame.name, currentGame.exeName)
          const allowRobloxSubGame = appSettings.discordEnabled && appSettings.discordRpcRobloxSubGame !== false
          if (isRoblox && allowRobloxSubGame && !robloxTrackerActive) {
            robloxTrackerActive = true
            startRobloxTracker(updateRobloxDiscordActivity)
          }
        }

        showOverlay(buildOverlayData(appSettings,currentGame,currentGamePid))
        syncRLHud(appSettings)
        syncDiscordPresence()
        refreshDiscordActivity()

      } else {
        // No game active
        if (currentGame) {
          missCount++
          // Protected games can briefly replace their launch process before the
          // shipping binary appears. Preserve the same session through that handoff.
          const launching = currentGame && NON_STEAM_GAMES.some(game => game.bootstrap?.includes(currentGame!.exeName))
          if (missCount < (launching && Date.now() - currentGame.startTime < 90_000 ? 10 : 3)) {
            return
          }
          missCount = 0
          console.log(`[ProcessMonitor] Detected game stopped: ${currentGame.name}`)
          const isRoblox = isRobloxGame(currentGame.name, currentGame.exeName)
          const stoppedWasRoblox = isRoblox
          const stoppedPid = currentGamePid
          try {
            persistCurrentSession()
            if (isRoblox) {
              mainWindow?.webContents.send('roblox:playtime-updated')
            }
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
            stopRobloxTracker(updateRobloxDiscordActivity)
          }
          lastActiveRobloxExperience = null
          stopRobloxAntiAfk()

          // Deactivate AutoClip
          onGameStoppedAutoClip()

          if (appSettings.autoRestoreOnGameStop !== false) {
            try {
              if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
              }
            } catch (_) {}
          }

          currentGame = null
          currentGamePid = 0
          stopGameFpsMonitor()
          mainWindow?.webContents.send('games:stopped')

          // Reclaim unused data without paging out the launcher while it is reopening.
          requestMemoryRelief()
          syncOverlaySettingsLive()
        }

        if (!appSettings.discordEnabled) {
          clearDiscordActivity()
          return
        }

        // Priority 2: Check for external downloads (Steam & Epic Games) ONLY if their client processes are running
        const isSteamRunning = runningExes.has('steam.exe')
        const isEpicRunning = runningExes.has('epicgameslauncher.exe')
        downloadClients = { steam: isSteamRunning, epic: isEpicRunning }
        
        // Expire cached download activity during games; never restore an old
        // download after a long session or after its launcher has exited.
        if (!appSettings.showDownloads || (!isSteamRunning && !isEpicRunning)) {
          lastActiveDownload = null; lastDownloadCheck = 0; downloadScanRevision++; steamDownloads.reset()
        } else if (!downloadScanInProgress && Date.now() - lastDownloadCheck >= 8000) {
          refreshExternalDownloads(isSteamRunning, isEpicRunning, generation)
        }

        syncDiscordPresence()
      }
    } catch (error) {
      console.warn('[ProcessMonitor] Process snapshot failed:', error)
    } finally {
      isProcessScanInProgress = false
    }
  })
  }, 3000)

  // Always-on overlays must also start when Eclipse opens without a running game.
  syncOverlaySettingsLive()
}

export function getCurrentDetectedGame() {
  return currentGame
}

export function getCurrentDetectedGamePid(): number {
  return currentGamePid
}

export function stopProcessMonitor(): void {
  downloadScanRevision++; steamDownloads.reset(); lastActiveDownload = null; downloadClients = { steam: false, epic: false }; clearTimeout(steamActivityRefreshTimer); steamActivityRefreshTimer = undefined
  monitorGeneration++
  if (monitorInterval) clearInterval(monitorInterval)
  monitorInterval = null
  resetCurrentDetectedGame()
  previousRunningExes.clear()
}

export function resetCurrentDetectedGame() {
  if (currentGame) {
    console.log(`[ProcessMonitor] Manually resetting detected game: ${currentGame.name}`)
    try {
      persistCurrentSession()
    } catch {}
    if (rlServiceActive) {
      rlServiceActive = false
      stopRLService()
    }
    if (robloxTrackerActive) {
      robloxTrackerActive = false
      stopRobloxTracker(updateRobloxDiscordActivity)
    }
    lastActiveRobloxExperience = null
    stopRobloxAntiAfk()
    stopGameFpsMonitor()
    onGameStoppedAutoClip()
    currentGame = null
    currentGamePid = 0
    missCount = 0
    hideOverlay()
    syncDiscordPresence()
  }
}

export function syncOverlaySettingsLive(explicitSettings?: any) {
  if (explicitSettings) {
    updateSettingsInMemory(explicitSettings)
  }
  const appSettings = explicitSettings
    ? { ...getAppSettings(), ...explicitSettings }
    : getAppSettings()

  if (isRobloxGame(currentGame?.name,currentGame?.exeName)) {
    if (appSettings.overlayRobloxAntiAfk) startRobloxAntiAfk()
    else stopRobloxAntiAfk()
  }
  showOverlay(buildOverlayData(appSettings,currentGame,currentGamePid))
  syncRLHud(appSettings)

  const trackRoblox = !!currentGame && isRobloxGame(currentGame.name, currentGame.exeName) && appSettings.discordRpcRobloxSubGame !== false && appSettings.discordEnabled
  if (trackRoblox && !robloxTrackerActive) { robloxTrackerActive = true; startRobloxTracker(updateRobloxDiscordActivity) }
  else if (!trackRoblox && robloxTrackerActive) {
    robloxTrackerActive = false
    stopRobloxTracker(updateRobloxDiscordActivity)
    lastActiveRobloxExperience = null
  }
  syncDiscordPresence()
}
