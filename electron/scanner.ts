/**
 * scanner.ts — GameHub Game Scanner
 * Detects installed Steam and Epic Games on Windows.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

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
}

export type ScanProgress = {
  stage: 'steam' | 'epic' | 'rockstar' | 'done'
  message: string
  count: number
}

type ProgressCallback = (progress: ScanProgress) => void

// ─── Main Entry ────────────────────────────────────────────────────────────────
export async function scanGames(onProgress?: ProgressCallback): Promise<InstalledGame[]> {
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
    
    // Uninstalled Steam Games
    onProgress?.({ stage: 'steam', message: 'Scanning uninstalled Steam games…', count: steamGames.length })
    const uninstalledSteamGames = await scanUninstalledSteamGames(steamInstalledAppIds)
    results.push(...uninstalledSteamGames)
    onProgress?.({ stage: 'steam', message: `Found ${uninstalledSteamGames.length} uninstalled Steam games`, count: steamGames.length + uninstalledSteamGames.length })
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

  onProgress?.({ stage: 'done', message: `Scan complete. ${results.length} games found.`, count: results.length })
  return results
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

    const manifests = fs.readdirSync(steamappsPath)
      .filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))

    for (const manifest of manifests) {
      try {
        const acfPath = path.join(steamappsPath, manifest)
        const content = fs.readFileSync(acfPath, 'utf-8')
        const appId = extractVdfValue(content, 'appid')
        const name = extractVdfValue(content, 'name')
        const installDir = extractVdfValue(content, 'installdir')

        if (!appId || !name || !installDir) continue

        // Skip certain utility appids
        const utilityIds = ['228980', '1070560', '1391110']
        if (utilityIds.includes(appId)) continue

        games.push({
          id: `steam-${appId}`,
          name,
          platform: 'steam',
          installPath: path.join(steamappsPath, 'common', installDir),
          launchUrl: `steam://rungameid/${appId}`,
          iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
          appId,
        })
      } catch {
        // Skip malformed manifests
      }
    }
  }

  return games
}

let cachedSteamAppList: Record<string, string> | null = null

async function getSteamAppList(): Promise<Record<string, string>> {
  if (cachedSteamAppList) return cachedSteamAppList
  try {
    const res = await fetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    
    if (!res.ok) {
      console.warn('[Scanner] Steam API returned', res.status)
      return {}
    }
    
    const text = await res.text()
    if (!text.startsWith('{')) {
      console.warn('[Scanner] Steam API returned non-JSON')
      return {}
    }

    const data = JSON.parse(text)
    const map: Record<string, string> = {}
    if (data?.applist?.apps) {
      for (const app of data.applist.apps) {
        map[app.appid.toString()] = app.name
      }
    }
    cachedSteamAppList = map
    return map
  } catch (e) {
    console.error('[Scanner] Failed to fetch Steam App List', e)
    return {}
  }
}

async function scanUninstalledSteamGames(installedIds: Set<string>): Promise<InstalledGame[]> {
  const steamPath = await getSteamPath()
  if (!steamPath) return []

  const userdataDir = path.join(steamPath, 'userdata')
  if (!fs.existsSync(userdataDir)) return []

  const ownedAppIds = new Set<string>()
  const userDirs = fs.readdirSync(userdataDir)
  
  for (const dir of userDirs) {
    const configPath = path.join(userdataDir, dir, 'config', 'localconfig.vdf')
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8')
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
  }

  if (ownedAppIds.size === 0) return []

  const appMap = await getSteamAppList()
  const games: InstalledGame[] = []

  for (const appId of ownedAppIds) {
    if (installedIds.has(appId)) continue

    // Use a fallback name if the API failed or didn't have the ID
    const name = appMap[appId] || `Steam App ${appId}`
    
    // Skip common utility/tool IDs that are often owned but not games
    if (['228980', '1070560', '1391110', '228980'].includes(appId)) continue

    games.push({
      id: `steam-${appId}`,
      name,
      platform: 'steam',
      installPath: '',
      launchUrl: `steam://install/${appId}`,
      iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
      appId,
      installed: false
    })
  }

  return games
}

async function getSteamPath(): Promise<string | null> {
  // Try registry first
  try {
    const { stdout } = await execAsync(
      'reg query "HKCU\\Software\\Valve\\Steam" /v "SteamPath" 2>nul'
    )
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (match) return match[1].trim().replace(/\//g, '\\')
  } catch { /* ignore */ }

  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v "InstallPath" 2>nul'
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

// ─── Epic Games Scanner ─────────────────────────────────────────────────────────
async function scanEpic(): Promise<InstalledGame[]> {
  const manifestDir = await getEpicManifestDir()
  if (!manifestDir || !fs.existsSync(manifestDir)) {
    throw new Error('Epic Games manifest directory not found')
  }

  const items = fs.readdirSync(manifestDir).filter(f => f.endsWith('.item'))
  const games: InstalledGame[] = []

  for (const item of items) {
    try {
      const filePath = path.join(manifestDir, item)
      const raw = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)

      const name: string = data.DisplayName
      const installLocation: string = data.InstallLocation
      const catalogItemId: string = data.CatalogItemId
      const launchExecutable: string = data.LaunchExecutable || ''
      const appName: string = data.AppName || catalogItemId

      if (!name || !installLocation || !catalogItemId) continue

      // Skip engine components and redistributables
      if (name.toLowerCase().includes('unreal engine') && !data.LaunchExecutable) continue

      const execPath = launchExecutable
        ? path.join(installLocation, launchExecutable)
        : installLocation

      games.push({
        id: `epic-${catalogItemId}`,
        name,
        platform: 'epic',
        installPath: installLocation,
        launchUrl: `com.epicgames.launcher://apps/${appName}?action=launch&silent=true`,
        appId: catalogItemId,
      })
    } catch {
      // Skip malformed manifests
    }
  }

  return games
}

async function getEpicManifestDir(): Promise<string | null> {
  // Primary location
  const primary = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
  if (fs.existsSync(primary)) return primary

  // Registry lookup
  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher" /v "AppDataPath" 2>nul'
    )
    const match = stdout.match(/AppDataPath\s+REG_SZ\s+(.+)/i)
    if (match) {
      const base = match[1].trim()
      const manifestPath = path.join(base, 'Manifests')
      if (fs.existsSync(manifestPath)) return manifestPath
    }
  } catch { /* ignore */ }

  return null
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
