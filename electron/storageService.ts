import { ipcMain, shell } from 'electron'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface DriveInfo {
  deviceId: string
  volumeName: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  usedPercentage: number
}

export interface GameStorageItem {
  id: string
  name: string
  platform: 'steam' | 'epic' | 'custom'
  installPath: string
  drive: string
  sizeBytes: number
  sizeFormatted: string
  steamId?: number
  iconUrl?: string
}

let cachedDrives: DriveInfo[] = []
let lastDriveFetch = 0
const gameSizeCache = new Map<string, { size: number; timestamp: number }>()

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Super-fast Steam AppManifest parser (0.1ms)
 * Reads SizeOnDisk directly from steamapps/appmanifest_<appId>.acf
 */
function getSteamSizeFromManifest(installPath: string, steamId?: number): number {
  if (!installPath && !steamId) return 0
  try {
    const parentDir = path.dirname(installPath) // .../steamapps/common
    const steamappsDir = path.dirname(parentDir) // .../steamapps

    if (steamId) {
      const acf = path.join(steamappsDir, `appmanifest_${steamId}.acf`)
      if (fs.existsSync(acf)) {
        const content = fs.readFileSync(acf, 'utf8')
        const match = content.match(/"SizeOnDisk"\s+"(\d+)"/i)
        if (match && match[1]) {
          return parseInt(match[1], 10)
        }
      }
    }

    // Try finding manifest by searching steamapps folder for matching installdir
    if (fs.existsSync(steamappsDir)) {
      const folderName = path.basename(installPath).toLowerCase()
      const files = fs.readdirSync(steamappsDir)
      for (const f of files) {
        if (f.startsWith('appmanifest_') && f.endsWith('.acf')) {
          const acfPath = path.join(steamappsDir, f)
          const content = fs.readFileSync(acfPath, 'utf8')
          if (content.toLowerCase().includes(`"installdir"\t\t"${folderName}"`) || content.toLowerCase().includes(`"installdir"\t"${folderName}"`)) {
            const match = content.match(/"SizeOnDisk"\s+"(\d+)"/i)
            if (match && match[1]) {
              return parseInt(match[1], 10)
            }
          }
        }
      }
    }
  } catch (_) {}
  return 0
}

/**
 * Asynchronous non-blocking directory size calculation
 */
async function getFolderSizeAsync(dirPath: string): Promise<number> {
  let total = 0
  try {
    if (!fs.existsSync(dirPath)) return 0
    const stat = await fs.promises.stat(dirPath)
    if (!stat.isDirectory()) return stat.size

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          const subEntries = await fs.promises.readdir(fullPath, { withFileTypes: true })
          for (const sub of subEntries) {
            if (!sub.isDirectory()) {
              const subStat = await fs.promises.stat(path.join(fullPath, sub.name))
              total += subStat.size
            }
          }
        } else {
          const fileStat = await fs.promises.stat(fullPath)
          total += fileStat.size
        }
      } catch (_) {}
    }
  } catch (_) {}
  return total
}

export function queryDrives(): Promise<DriveInfo[]> {
  const now = Date.now()
  // Return cached drives if fetched within the last 10 seconds
  if (cachedDrives.length > 0 && now - lastDriveFetch < 10000) {
    return Promise.resolve(cachedDrives)
  }

  return new Promise((resolve) => {
    const cmd = `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceId, VolumeName, Size, FreeSpace | ConvertTo-Json`
    exec(`powershell -NoProfile -NonInteractive -Command "${cmd}"`, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        resolve(cachedDrives)
        return
      }

      try {
        const parsed = JSON.parse(stdout.trim())
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        const drives: DriveInfo[] = arr.map((d: any) => {
          const total = Number(d.Size) || 0
          const free = Number(d.FreeSpace) || 0
          const used = Math.max(0, total - free)
          const usedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0
          return {
            deviceId: d.DeviceId || 'C:',
            volumeName: d.VolumeName || (d.DeviceId === 'C:' ? 'Lokaler Datenträger' : 'Festplatte'),
            totalBytes: total,
            freeBytes: free,
            usedBytes: used,
            usedPercentage: usedPct,
          }
        })
        cachedDrives = drives
        lastDriveFetch = Date.now()
        resolve(drives)
      } catch (e) {
        console.error('[StorageService] JSON parse failed:', e)
        resolve(cachedDrives)
      }
    })
  })
}

export async function calculateGameSizes(games: any[]): Promise<GameStorageItem[]> {
  if (!Array.isArray(games)) return []

  const results: GameStorageItem[] = []

  for (const g of games) {
    const installPath = g.installPath || ''
    let size = g.sizeBytes || 0
    let drive = 'C:'

    if (installPath) {
      const driveMatch = installPath.match(/^([A-Za-z]:)/)
      if (driveMatch) drive = driveMatch[1].toUpperCase()

      // Check cache first (cached for 1 hour)
      const cached = gameSizeCache.get(installPath)
      if (cached && Date.now() - cached.timestamp < 3600000) {
        size = cached.size
      } else if (!size) {
        // Fast manifest read
        size = getSteamSizeFromManifest(installPath, g.steamId)

        // If manifest didn't give size, compute asynchronously without freezing UI
        if (!size && fs.existsSync(installPath)) {
          size = await getFolderSizeAsync(installPath)
        }

        if (size > 0) {
          gameSizeCache.set(installPath, { size, timestamp: Date.now() })
        }
      }
    }

    results.push({
      id: String(g.id || g.appId || g.name),
      name: g.name || 'Unbekanntes Spiel',
      platform: g.platform || 'custom',
      installPath,
      drive,
      sizeBytes: size,
      sizeFormatted: formatBytes(size),
      steamId: g.steamId,
      iconUrl: g.iconUrl,
    })
  }

  // Sort descending by size
  results.sort((a, b) => b.sizeBytes - a.sizeBytes)
  return results
}

export function initStorageIPC() {
  ipcMain.handle('storage:get-drives', async () => {
    return await queryDrives()
  })

  ipcMain.handle('storage:open-folder', async (_event, folderPath: string) => {
    if (!folderPath) return { success: false }
    try {
      const p = fs.existsSync(folderPath) ? folderPath : path.dirname(folderPath)
      await shell.openPath(p)
      return { success: true }
    } catch (err) {
      console.error('[StorageService] Failed to open folder:', err)
      return { success: false }
    }
  })

  ipcMain.handle('storage:get-game-sizes', async (_event, games: any[]) => {
    return await calculateGameSizes(games)
  })

  // Preload drives during startup in background (non-blocking)
  setTimeout(() => {
    queryDrives().catch(() => {})
  }, 1000)
}
