/**
 * scanner.ts — GameHub Game Scanner
 * Detects installed Steam, Epic, Riot, Rockstar and Roblox games on Windows.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { discoverEpicGames, discoverRiotGames } from './nonSteamDiscovery'

const execAsync = promisify(exec)

export type InstalledGame = {
  id: string
  name: string
  platform: 'steam' | 'epic' | 'custom'
  installPath: string
  launchUrl: string
  iconUrl?: string
  appId?: string
  steamId?: number
  installed?: boolean
  executable?: string
}

export type ScanProgress = {
  stage: 'steam' | 'epic' | 'riot' | 'rockstar' | 'roblox' | 'done'
  message: string
  count: number
}

type ProgressCallback = (progress: ScanProgress) => void

export type ScanOptions = {
  scanUninstalledSteam?: boolean
}

// ─── Main Entry ────────────────────────────────────────────────────────────────
export async function scanGames(onProgress?: ProgressCallback, options?: ScanOptions): Promise<InstalledGame[]> {
  const results: InstalledGame[] = []

  // Steam
  onProgress?.({ stage: 'steam', message: 'Scanning Steam library…', count: 0 })
  let steamInstalledAppIds = new Set<string>()
  try {
    const steamGames = await scanSteam()
    steamGames.forEach(g => {
      g.installed = true
      if (g.appId) steamInstalledAppIds.add(g.appId)
    })
    results.push(...steamGames)
    onProgress?.({ stage: 'steam', message: `Found ${steamGames.length} installed Steam games`, count: steamGames.length })

    // Uninstalled Steam Games (instant skip if disabled by user settings)
    if (options?.scanUninstalledSteam !== false) {
      onProgress?.({ stage: 'steam', message: 'Scanning uninstalled Steam games…', count: steamGames.length })
      const uninstalledSteamGames = await scanUninstalledSteamGames(steamInstalledAppIds)
      results.push(...uninstalledSteamGames)
      onProgress?.({ stage: 'steam', message: `Found ${uninstalledSteamGames.length} uninstalled Steam games`, count: steamGames.length + uninstalledSteamGames.length })
    }
  } catch (e) {
    console.warn('[Scanner] Steam scan failed:', e)
    onProgress?.({ stage: 'steam', message: 'Steam not found or not installed', count: 0 })
  }

  // Epic
  onProgress?.({ stage: 'epic', message: 'Scanning Epic Games library…', count: 0 })
  try {
    const epicGames = await scanEpic()
    epicGames.forEach(g => g.installed = true)
    results.push(...epicGames)
    onProgress?.({ stage: 'epic', message: `Found ${epicGames.length} Epic games`, count: epicGames.length })
  } catch (e) {
    console.warn('[Scanner] Epic scan failed:', e)
    onProgress?.({ stage: 'epic', message: 'Epic Games not found', count: 0 })
  }

  onProgress?.({ stage: 'riot', message: 'Scanning Riot Games…', count: results.length })
  const riotGames = await discoverRiotGames()
  results.push(...riotGames)
  onProgress?.({ stage: 'riot', message: `Found ${riotGames.length} Riot games`, count: results.length })

  // Rockstar Games
  onProgress?.({ stage: 'rockstar', message: 'Scanning Rockstar Games…', count: results.length })
  try {
    const rockstarGames = await scanRockstar()
    results.push(...rockstarGames)
    onProgress?.({ stage: 'rockstar', message: `Found ${rockstarGames.length} Rockstar games`, count: results.length })
  } catch (e) {
    console.warn('[Scanner] Rockstar scan failed:', e)
    onProgress?.({ stage: 'rockstar', message: 'Rockstar Games not found', count: results.length })
  }

  // Roblox
  onProgress?.({ stage: 'roblox', message: 'Scanning Roblox…', count: results.length })
  try {
    const robloxGames = await scanRoblox()
    results.push(...robloxGames)
    if (robloxGames.length > 0) {
      onProgress?.({ stage: 'roblox', message: `Found Roblox`, count: results.length })
    }
  } catch (e) {
    console.warn('[Scanner] Roblox scan failed:', e)
  }

  onProgress?.({ stage: 'done', message: `Scan complete. ${results.length} games found.`, count: results.length })
  if (global.gc) {
    try { global.gc() } catch {}
  }
  return results
}

// Known Steam AppID to canonical title mappings for zero-latency resolution
const KNOWN_STEAM_APP_NAMES: Record<number, string> = {
  105600: 'Terraria',
  1281930: 'tModLoader',
  311210: 'Call of Duty: Black Ops III',
  4000: "Garry's Mod",
  431960: 'Wallpaper Engine',
  477160: 'Human: Fall Flat',
  730: 'Counter-Strike 2',
  3722330: 'Shift At Midnight',
  4704690: 'MECCHA CHAMELEON',
  346330: 'BrainBread 2',
  359050: 'Shower With Your Dad Simulator 2015',
  363970: 'Clicker Heroes',
  365670: 'Blender',
  381210: 'Dead by Daylight',
  4001890: 'How to Fish',
  570: 'Dota 2',
  440: 'Team Fortress 2',
  550: 'Left 4 Dead 2',
  252950: 'Rocket League',
  271590: 'Grand Theft Auto V',
  1172470: 'Apex Legends',
  1086940: "Baldur's Gate 3",
  1245620: 'Elden Ring',
  1091500: 'Cyberpunk 2077',
  252490: 'Rust',
  892970: 'Valheim',
  526870: 'Satisfactory',
  990080: 'Hogwarts Legacy',
  1174180: 'Red Dead Redemption 2',
  292030: 'The Witcher 3: Wild Hunt',
  1623730: 'Palworld',
  2358720: 'Black Myth: Wukong',
  2183900: 'Warhammer 40,000: Space Marine 2',
  1145360: 'Hades',
  1868140: 'Dave the Diver',
  1332010: 'Stray',
  2357570: 'Overwatch 2',
  1097150: 'Fall Guys',
  1222670: 'The Sims 4',
  480: 'Spacewar',
  218620: 'PAYDAY 2',
  230410: 'Warframe',
  359550: "Tom Clancy's Rainbow Six Siege",
  306130: 'The Elder Scrolls Online',
  377160: 'Fallout 4',
  489830: 'The Elder Scrolls V: Skyrim Special Edition',
  1938090: 'Call of Duty',
  251570: '7 Days to Die',
  289070: "Sid Meier's Civilization VI",
  108600: 'Project Zomboid',
  648800: 'Raft',
  322330: "Don't Starve Together",
  1966720: 'Lethal Company',
  2073850: 'The Finals',
  553850: 'HELLDIVERS™ 2',
  236390: 'War Thunder',
  39210: 'FINAL FANTASY XIV Online',
  1063730: 'New World',
  1240440: 'Halo Infinite',
  1203220: 'NARAKA: BLADEPOINT',
  1172620: 'Sea of Thieves',
  221100: 'DayZ',
  582010: 'Monster Hunter: World',
  1446780: 'MONSTER HUNTER RISE',
  2246340: 'Monster Hunter Wilds',
  3017860: 'DOOM: The Dark Ages',
  2677660: 'Indiana Jones and the Great Circle',
  2767030: 'Marvel Rivals',
  1771300: 'Kingdom Come: Deliverance II',
  2457220: 'Avowed',
  1158670: 'Dune: Awakening',
  3280350: 'Death Stranding 2: On the Beach',
  1601580: 'Frostpunk 2',
  2124490: 'Silent Hill 2',
  1790600: 'Dragon Ball: Sparking! ZERO',
  1643320: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl',
  2322010: 'God of War Ragnarök',
  2694490: 'Path of Exile 2',
  1295660: 'Sid Meier’s Civilization® VII',
  2842040: 'Star Wars Outlaws',
  1627720: 'Lies of P',
  1817230: 'Hi-Fi RUSH',
  1850570: 'DEATH STRANDING DIRECTOR\'S CUT',
  2050650: 'Resident Evil 4',
  1687950: 'Persona 5 Royal',
  1817070: "Marvel's Spider-Man Remastered",
  1593500: 'God of War',
  814380: 'Sekiro: Shadows Die Twice',
  999001: 'Roblox',
}

function isPlaceholderAppName(name?: string, appId?: string | number): boolean {
  if (!name || !name.trim()) return true
  const trimmed = name.trim()
  if (/^(?:appid[_\s-]*|app[_\s-]*|steam[_\s-]*app[_\s-]*|steam[_\s-]+)\d+$/i.test(trimmed)) {
    return true
  }
  if (appId && String(appId).trim() === trimmed) {
    return true
  }
  if (/^\d{5,10}$/.test(trimmed)) {
    return true
  }
  return false
}

// ─── Steam Scanner ──────────────────────────────────────────────────────────────
async function scanSteam(): Promise<InstalledGame[]> {
  const steamPath = await getSteamPath()
  if (!steamPath) throw new Error('Steam installation not found')

  const libraryFolders = getSteamLibraryFolders(steamPath)
  const games: InstalledGame[] = []

  for (const libraryPath of libraryFolders) {
    const steamappsPath = path.join(libraryPath, 'steamapps')
    if (!fs.existsSync(steamappsPath)) continue

    const manifests = (await fs.promises.readdir(steamappsPath))
      .filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))

    for (const manifest of manifests) {
      try {
        const acfPath = path.join(steamappsPath, manifest)
        const content = await fs.promises.readFile(acfPath, 'utf-8')
        let appId = extractVdfValue(content, 'appid')
        let name = extractVdfValue(content, 'name')
        const installDir = extractVdfValue(content, 'installdir')

        if (!appId) {
          const mMatch = manifest.match(/appmanifest_(\d+)\.acf/i)
          if (mMatch) appId = mMatch[1]
        }

        if (!appId || !installDir) continue

        // Skip certain utility appids
        const utilityIds = ['228980', '1070560', '1391110']
        if (utilityIds.includes(appId)) continue

        const numId = Number(appId)
        if (!name || isPlaceholderAppName(name, appId)) {
          const known = KNOWN_STEAM_APP_NAMES[numId]
          name = known || name || `Steam App ${appId}`
        }

        games.push({
          id: `steam-${appId}`,
          name,
          platform: 'steam',
          installPath: path.join(steamappsPath, 'common', installDir),
          launchUrl: `steam://rungameid/${appId}`,
          iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
          appId,
          steamId: numId || undefined,
        })
      } catch {
        // Skip malformed manifests
      }
    }
  }

  return games
}

let memoryAppCache: Record<string, string> | null = null

function getSteamCachePath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'steam_app_cache.json')
    }
  } catch {}
  return path.join(process.env.APPDATA || os.homedir(), 'eclipse-launcher', 'steam_app_cache.json')
}

function loadSteamAppCache(): Record<string, string> {
  if (memoryAppCache) return memoryAppCache
  try {
    const cacheFile = getSteamCachePath()
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      if (data && typeof data === 'object') {
        memoryAppCache = data
        return memoryAppCache!
      }
    }
  } catch {}
  memoryAppCache = {}
  return memoryAppCache!
}

function saveSteamAppCache(cache: Record<string, string>) {
  try {
    const cacheFile = getSteamCachePath()
    const dir = path.dirname(cacheFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf-8')
  } catch {}
}

let backgroundResolverRunning = false

function queueBackgroundResolution(missingIds: string[]) {
  if (backgroundResolverRunning || missingIds.length === 0) return
  backgroundResolverRunning = true

  // Fire and forget, resolve missing IDs in background without delaying startup
  setTimeout(async () => {
    try {
      const cache = loadSteamAppCache()
      let hasNew = false
      const BATCH = 6

      for (let i = 0; i < missingIds.length; i += BATCH) {
        const batch = missingIds.slice(i, i + BATCH)
        await Promise.allSettled(
          batch.map(async idStr => {
            if (cache[idStr]) return
            try {
              const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${idStr}&filters=basic`, {
                signal: AbortSignal.timeout(2000),
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
              })
              if (res.ok) {
                const text = await res.text()
                if (text && !text.trim().startsWith('<')) {
                  const data = JSON.parse(text)
                  if (data && data[idStr]?.success && data[idStr]?.data?.name) {
                    const name = String(data[idStr].data.name).trim()
                    if (name && !name.toLowerCase().startsWith('steam app ')) {
                      cache[idStr] = name
                      hasNew = true
                    }
                  }
                }
              }
            } catch {}
          })
        )
        if (hasNew) {
          saveSteamAppCache(cache)
          hasNew = false
        }
        await new Promise(r => setTimeout(r, 200))
      }
      saveSteamAppCache(cache)
    } catch {} finally {
      backgroundResolverRunning = false
    }
  }, 1000)
}

async function getSteamAppNames(targetIds: Set<string>): Promise<Record<string, string>> {
  if (targetIds.size === 0) return {}
  const cache = loadSteamAppCache()
  const map: Record<string, string> = {}
  const needed: string[] = []

  // 1. Instant zero-latency resolution from Known map & persistent on-disk cache
  for (const idStr of targetIds) {
    const num = Number(idStr)
    if (num && KNOWN_STEAM_APP_NAMES[num]) {
      map[idStr] = KNOWN_STEAM_APP_NAMES[num]
      if (!cache[idStr]) cache[idStr] = KNOWN_STEAM_APP_NAMES[num]
    } else if (cache[idStr]) {
      map[idStr] = cache[idStr]
    } else {
      needed.push(idStr)
    }
  }

  if (needed.length === 0) return map

  // 2. Ultra-fast synchronous batch: resolve up to 16 games with a 1.2s timeout so splash NEVER freezes!
  const syncBatch = needed.slice(0, 16)
  let newlyFound = false

  await Promise.allSettled(
    syncBatch.map(async idStr => {
      // Try Steam Store AppDetails API
      try {
        const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${idStr}&filters=basic`, {
          signal: AbortSignal.timeout(1200),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        })
        if (res.ok) {
          const text = await res.text()
          if (text && !text.trim().startsWith('<')) {
            const data = JSON.parse(text)
            if (data && data[idStr]?.success && data[idStr]?.data?.name) {
              const name = String(data[idStr].data.name).trim()
              if (name && !name.toLowerCase().startsWith('steam app ')) {
                map[idStr] = name
                cache[idStr] = name
                newlyFound = true
                return
              }
            }
          }
        }
      } catch {}

      // Fast fallback: SteamSpy API
      try {
        const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${idStr}`, {
          signal: AbortSignal.timeout(1000)
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.name) {
            const name = String(data.name).trim()
            if (name && !name.toLowerCase().startsWith('steam app ')) {
              map[idStr] = name
              cache[idStr] = name
              newlyFound = true
            }
          }
        }
      } catch {}
    })
  )

  if (newlyFound) {
    saveSteamAppCache(cache)
  }

  // 3. Queue any remaining unresolved IDs in the background to avoid holding up the splash screen
  const stillMissing = needed.filter(id => !map[id])
  if (stillMissing.length > 0) {
    queueBackgroundResolution(stillMissing)
  }

  return map
}

async function scanUninstalledSteamGames(installedIds: Set<string>): Promise<InstalledGame[]> {
  const steamPath = await getSteamPath()
  if (!steamPath) return []

  const userdataDir = path.join(steamPath, 'userdata')
  if (!fs.existsSync(userdataDir)) return []

  const ownedAppIds = new Set<string>()
  const userDirs = fs.readdirSync(userdataDir)

  // Sort user profiles by localconfig.vdf mtime so the most active account is prioritized
  const sortedUserDirs = userDirs
    .map(dir => {
      const configPath = path.join(userdataDir, dir, 'config', 'localconfig.vdf')
      let mtime = 0
      try {
        if (fs.existsSync(configPath)) {
          mtime = fs.statSync(configPath).mtimeMs
        }
      } catch {}
      return { dir, mtime, configPath }
    })
    .filter(u => u.mtime > 0)
    .sort((a, b) => b.mtime - a.mtime)

  for (const { configPath } of sortedUserDirs) {
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8')
      const matchApps = content.split(/"apps"\s*\{/i)
      if (matchApps.length > 1) {
        const searchStr = matchApps[1]
        let openBraces = 1
        let endIndex = searchStr.length

        for (let i = 0; i < searchStr.length; i++) {
          if (searchStr[i] === '{') openBraces++
          else if (searchStr[i] === '}') openBraces--
          if (openBraces === 0) {
            endIndex = i
            break
          }
        }

        const appsSection = searchStr.substring(0, endIndex)
        const idMatches = Array.from(appsSection.matchAll(/"(\d{2,10})"\s*\{/g))
        for (const m of idMatches) {
          ownedAppIds.add(m[1])
        }
      }
    } catch { /* ignore */ }
  }

  const uninstalledIds = new Set<string>()
  for (const appId of ownedAppIds) {
    if (!installedIds.has(appId) && !['228980', '1070560', '1391110'].includes(appId)) {
      uninstalledIds.add(appId)
    }
  }

  if (uninstalledIds.size === 0) return []

  const appMap = await getSteamAppNames(uninstalledIds)
  const games: InstalledGame[] = []

  for (const appId of uninstalledIds) {
    const numId = Number(appId)
    const name = appMap[appId] || KNOWN_STEAM_APP_NAMES[numId] || `Steam App ${appId}`
    games.push({
      id: `steam-${appId}`,
      name,
      platform: 'steam',
      installPath: '',
      launchUrl: `steam://install/${appId}`,
      iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
      appId,
      steamId: numId || undefined,
      installed: false
    })
  }

  return games
}

async function getSteamPath(): Promise<string | null> {
  // Try registry first
  try {
    const { stdout } = await execAsync(
      'reg query "HKCU\\Software\\Valve\\Steam" /v "SteamPath" 2>nul', { windowsHide: true, timeout: 3000 }
    )
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (match) return match[1].trim().replace(/\//g, '\\')
  } catch { /* ignore */ }

  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v "InstallPath" 2>nul', { windowsHide: true, timeout: 3000 }
    )
    const match = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/i)
    if (match) return match[1].trim()
  } catch { /* ignore */ }

  // Fallback: common paths
  const fallbacks = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ]
  for (const p of fallbacks) {
    if (fs.existsSync(path.join(p, 'Steam.exe'))) return p
  }

  return null
}

function getSteamLibraryFolders(steamPath: string): string[] {
  const folders = [steamPath]

  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (!fs.existsSync(vdfPath)) return folders

  try {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    // Match both old format (numeric keys) and new format with "path" key
    const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/gi)
    for (const match of pathMatches) {
      const folder = match[1].replace(/\\\\/g, '\\')
      if (folder && folder !== steamPath && !folders.includes(folder)) {
        folders.push(folder)
      }
    }
    // Old format: numbered entries
    const oldMatches = content.matchAll(/"[1-9]\d*"\s+"([A-Za-z]:[^"]+)"/g)
    for (const match of oldMatches) {
      const folder = match[1].replace(/\\\\/g, '\\')
      if (folder && !folders.includes(folder)) {
        folders.push(folder)
      }
    }
  } catch { /* ignore */ }

  return folders
}

function extractVdfValue(content: string, key: string): string | null {
  const regex = new RegExp(`"${key}"\\s+"([^"]+)"`, 'i')
  const match = content.match(regex)
  return match ? match[1] : null
}

// Known Steam AppIDs for popular games on Epic/other platforms
const KNOWN_NON_STEAM_STEAM_IDS: Record<string, number> = {
  'rocket league': 252950,
  'rocket league®': 252950,
  'fivem': 271590,
  'fivem application data': 271590,
  'spacewar': 480,
  'fall guys': 1097150,
  'overwatch 2': 2356550,
  'the sims 4': 1222670,
  'gta 5': 271590,
  'grand theft auto v': 271590,
  'gta v': 271590,
  'roblox': 999001,
}

function resolveKnownSteamId(name: string): number | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase().trim()
  if (KNOWN_NON_STEAM_STEAM_IDS[lower]) return KNOWN_NON_STEAM_STEAM_IDS[lower]
  const clean = lower.replace(/[®™©]/g, '').trim()
  if (KNOWN_NON_STEAM_STEAM_IDS[clean]) return KNOWN_NON_STEAM_STEAM_IDS[clean]
  const stripped = lower.replace(/[^a-z0-9]/g, '')
  for (const [k, v] of Object.entries(KNOWN_NON_STEAM_STEAM_IDS)) {
    if (k.replace(/[^a-z0-9]/g, '') === stripped) return v
  }
  return undefined
}

// ─── Epic Games Scanner ─────────────────────────────────────────────────────────
async function scanEpic(): Promise<InstalledGame[]> {
  return (await discoverEpicGames()).map(game => {
    const steamId = resolveKnownSteamId(game.name)
    return { ...game, steamId, iconUrl: game.iconUrl || (steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg` : undefined) }
  })
}

// ─── Rockstar Games Scanner ───────────────────────────────────────────────────
const ROCKSTAR_GAME_MAP = [
  { folderMatches: ['grand theft auto v enhanced', 'gta v enhanced', 'gtav enhanced'], name: 'Grand Theft Auto V Enhanced', steamId: 271590, mainExe: 'GTA5_Enhanced.exe', launcherExe: 'PlayGTAV.exe' },
  { folderMatches: ['grand theft auto v', 'gta v', 'gtav'], name: 'Grand Theft Auto V', steamId: 271590, mainExe: 'GTA5.exe', launcherExe: 'PlayGTAV.exe' },
  { folderMatches: ['red dead redemption 2', 'rdr2', 'rdr 2'], name: 'Red Dead Redemption 2', steamId: 1174180, mainExe: 'RDR2.exe', launcherExe: 'PlayRDR2.exe' },
  { folderMatches: ['red dead redemption', 'rdr'], name: 'Red Dead Redemption', steamId: 2668510, mainExe: 'RDR.exe', launcherExe: 'PlayRDR.exe' },
  { folderMatches: ['grand theft auto iv', 'gta iv', 'gta 4'], name: 'Grand Theft Auto IV: The Complete Edition', steamId: 12210, mainExe: 'GTAIV.exe', launcherExe: 'PlayGTAIV.exe' },
  { folderMatches: ['grand theft auto san andreas definitive', 'gta san andreas - the definitive edition', 'sanandreas'], name: 'GTA: San Andreas – The Definitive Edition', steamId: 1547000, mainExe: 'SanAndreas.exe', launcherExe: 'PlayGTASA.exe' },
  { folderMatches: ['grand theft auto vice city definitive', 'gta vice city - the definitive edition', 'vicecity'], name: 'GTA: Vice City – The Definitive Edition', steamId: 1546990, mainExe: 'ViceCity.exe', launcherExe: 'PlayGTAVC.exe' },
  { folderMatches: ['grand theft auto iii definitive', 'gta iii - the definitive edition', 'gta3'], name: 'GTA III – The Definitive Edition', steamId: 1546970, mainExe: 'LibertyCity.exe', launcherExe: 'PlayGTA3.exe' },
  { folderMatches: ['max payne 3', 'maxpayne3'], name: 'Max Payne 3', steamId: 204100, mainExe: 'MaxPayne3.exe', launcherExe: 'PlayMaxPayne3.exe' },
  { folderMatches: ['l.a. noire', 'la noire', 'lanoire'], name: 'L.A. Noire', steamId: 110800, mainExe: 'LANoire.exe', launcherExe: 'LANOption.exe' },
  { folderMatches: ['bully', 'bully scholarship edition'], name: 'Bully: Scholarship Edition', steamId: 12200, mainExe: 'Bully.exe', launcherExe: 'Bully.exe' },
]

export async function scanRockstar(): Promise<InstalledGame[]> {
  const games: InstalledGame[] = []
  const scannedPaths = new Set<string>()

  // Drives to check
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:', 'H:']
  const searchRoots: string[] = []

  for (const drive of drives) {
    searchRoots.push(
      path.join(drive, 'Program Files', 'Rockstar Games'),
      path.join(drive, 'Program Files (x86)', 'Rockstar Games'),
      path.join(drive, 'Rockstar Games'),
      path.join(drive, 'Games', 'Rockstar Games'),
      path.join(drive, 'Games')
    )
  }

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue
    try {
      const subdirs = fs.readdirSync(root, { withFileTypes: true })
      for (const ent of subdirs) {
        if (!ent.isDirectory()) continue
        const dirName = ent.name.toLowerCase()
        if (dirName === 'launcher' || dirName === 'social club' || dirName === 'redistributables') continue

        const fullDirPath = path.join(root, ent.name)
        const normalized = fullDirPath.toLowerCase()
        if (scannedPaths.has(normalized)) continue

        for (const meta of ROCKSTAR_GAME_MAP) {
          const isMatch = meta.folderMatches.some(m => dirName.includes(m))
          if (isMatch) {
            scannedPaths.add(normalized)
            let targetExe = meta.mainExe
            if (meta.launcherExe && fs.existsSync(path.join(fullDirPath, meta.launcherExe))) {
              targetExe = meta.launcherExe
            } else if (!fs.existsSync(path.join(fullDirPath, targetExe))) {
              try {
                const files = fs.readdirSync(fullDirPath)
                const anyExe = files.find(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('uninstall'))
                if (anyExe) targetExe = anyExe
              } catch {}
            }

            const exeFullPath = path.join(fullDirPath, targetExe)
            games.push({
              id: `rockstar-${meta.steamId || ent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
              name: meta.name || ent.name,
              platform: 'custom',
              installPath: fullDirPath,
              launchUrl: exeFullPath,
              appId: String(meta.steamId || ''),
              steamId: meta.steamId,
              installed: true,
            })
            break
          }
        }
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  return games
}

// ─── Roblox Scanner ────────────────────────────────────────────────────────────
export async function scanRoblox(): Promise<InstalledGame[]> {
  const games: InstalledGame[] = []
  if (process.platform !== 'win32') return games

  // 1. Direct registry lookup of roblox: protocol handler
  try {
    const regQueries = [
      'reg query "HKCU\\Software\\Classes\\roblox\\shell\\open\\command" /ve 2>nul',
      'reg query "HKCR\\roblox\\shell\\open\\command" /ve 2>nul',
      'reg query "HKCU\\Software\\ROBLOX Corporation\\Environments\\roblox-player" /v "RootFolder" 2>nul'
    ]

    for (const q of regQueries) {
      try {
        const { stdout } = await execAsync(q)
        // Extract quoted or unquoted .exe path
        const exeMatch = stdout.match(/"([^"]+\.exe)"/i) || stdout.match(/([a-zA-Z]:\\[^ \r\n\t]+\.exe)/i)
        if (exeMatch && exeMatch[1] && fs.existsSync(exeMatch[1])) {
          const exePath = exeMatch[1]
          games.push({
            id: 'roblox',
            name: 'Roblox',
            platform: 'custom',
            installPath: path.dirname(exePath),
            launchUrl: exePath,
            appId: '999001',
            steamId: 999001,
            installed: true,
            iconUrl: '/Roblox-Logo-Icon.png',
          })
          return games
        }

        const rootMatch = stdout.match(/RootFolder\s+REG_SZ\s+(.+)/i)
        if (rootMatch && rootMatch[1]) {
          const root = rootMatch[1].trim()
          if (fs.existsSync(root)) {
            const playerBeta = path.join(root, 'RobloxPlayerBeta.exe')
            const playerLauncher = path.join(root, 'RobloxPlayerLauncher.exe')
            const exe = fs.existsSync(playerBeta) ? playerBeta : fs.existsSync(playerLauncher) ? playerLauncher : 'roblox:'
            games.push({
              id: 'roblox',
              name: 'Roblox',
              platform: 'custom',
              installPath: root,
              launchUrl: exe,
              appId: '999001',
              steamId: 999001,
              installed: true,
              iconUrl: '/Roblox-Logo-Icon.png',
            })
            return games
          }
        }
      } catch {}
    }
  } catch {}

  // 2. Scan %LocalAppData%\Roblox\Versions & Program Files
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  const candidatesDirs = [
    path.join(localAppData, 'Roblox', 'Versions'),
    path.join(programFiles, 'Roblox', 'Versions'),
    path.join(programFilesX86, 'Roblox', 'Versions'),
  ]

  for (const versionsDir of candidatesDirs) {
    if (fs.existsSync(versionsDir)) {
      try {
        const subdirs = fs.readdirSync(versionsDir, { withFileTypes: true })
        for (const sub of subdirs) {
          if (!sub.isDirectory()) continue
          const fullPath = path.join(versionsDir, sub.name)
          const playerBeta = path.join(fullPath, 'RobloxPlayerBeta.exe')
          const playerLauncher = path.join(fullPath, 'RobloxPlayerLauncher.exe')

          let targetExe: string | null = null
          if (fs.existsSync(playerBeta)) {
            targetExe = playerBeta
          } else if (fs.existsSync(playerLauncher)) {
            targetExe = playerLauncher
          }

          if (targetExe) {
            games.push({
              id: 'roblox',
              name: 'Roblox',
              platform: 'custom',
              installPath: fullPath,
              launchUrl: targetExe,
              appId: '999001',
              steamId: 999001,
              installed: true,
              iconUrl: '/Roblox-Logo-Icon.png',
            })
            return games
          }
        }
      } catch (err) {}
    }
  }

  return games
}
