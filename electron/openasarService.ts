import { ipcMain, BrowserWindow, shell } from 'electron'
import { exec } from 'child_process'
import * as path from 'path'
import * as standardFs from 'fs'
import * as https from 'https'

// Import original-fs if in Electron to completely bypass Electron's ASAR archive cache,
// which otherwise locks .asar files on Windows.
// @ts-ignore
import * as originalFs from 'original-fs'

const fs: typeof standardFs = (originalFs && typeof (originalFs as any).existsSync === 'function')
  ? (originalFs as any)
  : standardFs

/**
 * Execute filesystem operations with ASAR disabled to prevent Electron handle locks
 */
function safeFsOp<T>(fn: () => T): T {
  const prev = (process as any).noAsar
  ;(process as any).noAsar = true
  try {
    return fn()
  } finally {
    ;(process as any).noAsar = prev
  }
}

export interface OpenAsarStatus {
  isDiscordInstalled: boolean
  isOpenAsarInstalled: boolean
  version?: string
  latestVersion?: string
  installPath?: string
  isInstalling?: boolean
}

let isCurrentlyInstalling = false
let cachedLatestVersion = 'Nightly'
let lastVersionFetchTime = 0

const OPENASAR_DOWNLOAD_URL = 'https://github.com/GooseMod/OpenAsar/releases/download/nightly/app.asar'

/**
 * Returns the Discord directory in LOCALAPPDATA
 */
function getDiscordBaseDir(): string {
  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(localAppData, 'Discord'),
    path.join(localAppData, 'DiscordCanary'),
    path.join(localAppData, 'DiscordPTB'),
    path.join(localAppData, 'DiscordDevelopment'),
  ]

  for (const dir of candidates) {
    if (safeFsOp(() => fs.existsSync(dir))) return dir
  }

  return path.join(localAppData, 'Discord')
}

/**
 * Returns the latest app-* folder in the Discord directory
 */
function getDiscordAppDir(): string | null {
  const baseDir = getDiscordBaseDir()
  if (!safeFsOp(() => fs.existsSync(baseDir))) return null

  try {
    const entries = safeFsOp(() => fs.readdirSync(baseDir))
    const appDirs = entries
      .filter(e => e.startsWith('app-') && safeFsOp(() => fs.statSync(path.join(baseDir, e)).isDirectory()))
      .sort()
      .reverse()

    if (appDirs.length > 0) {
      return path.join(baseDir, appDirs[0])
    }
  } catch (_) {}

  return null
}

/**
 * Returns the resources folder of the latest Discord installation
 */
export function getDiscordResourcesDir(): string | null {
  const appDir = getDiscordAppDir()
  if (!appDir) return null

  const resDir = path.join(appDir, 'resources')
  return safeFsOp(() => fs.existsSync(resDir)) ? resDir : null
}

/**
 * Checks if Discord is installed on Windows
 */
function checkDiscordInstalled(): boolean {
  return getDiscordAppDir() !== null
}

/**
 * Checks if OpenAsar is currently installed inside Discord resources
 */
function checkOpenAsarInstalled(): boolean {
  return safeFsOp(() => {
    const resDir = getDiscordResourcesDir()
    if (!resDir) return false

    // Check both candidates:
    // If Vencord is installed: app.asar is ~219-byte loader, and _app.asar is the app (OpenAsar).
    // If Vencord is not installed: app.asar is the app (OpenAsar).
    const candidates = ['_app.asar', 'app.asar']
    for (const file of candidates) {
      const filePath = path.join(resDir, file)
      if (fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath)
          // OpenAsar is ~30-100 KB (< 600 KB).
          // Discord default is ~3.6 MB (> 2 MB).
          // Vencord loader is < 1 KB (~219 B).
          if (stat.size > 2000 && stat.size < 600 * 1024) {
            return true
          }
        } catch (_) {}
      }
    }

    return false
  })
}

/**
 * Downloads a file over HTTPS with redirect support
 */
function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const follow = (targetUrl: string, maxRedirects = 5) => {
      if (maxRedirects <= 0) {
        resolve(false)
        return
      }

      const req = https.get(targetUrl, {
        headers: {
          'User-Agent': 'EclipseLauncher'
        },
        timeout: 30000,
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, maxRedirects - 1)
          return
        }

        if (res.statusCode !== 200) {
          resolve(false)
          return
        }

        safeFsOp(() => {
          const fileStream = fs.createWriteStream(destPath)
          res.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close(() => resolve(true))
          })
          fileStream.on('error', () => {
            try { fs.unlinkSync(destPath) } catch (_) {}
            resolve(false)
          })
        })
      })

      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    }

    follow(url)
  })
}

/**
 * Fetches latest OpenAsar release info from GitHub
 */
async function fetchLatestOpenAsarVersion(): Promise<string> {
  const now = Date.now()
  if (cachedLatestVersion && (now - lastVersionFetchTime < 10 * 60 * 1000)) {
    return cachedLatestVersion
  }

  return new Promise((resolve) => {
    const req = https.get('https://api.github.com/repos/GooseMod/OpenAsar/releases', {
      headers: {
        'User-Agent': 'EclipseLauncher',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 5000,
    }, (res) => {
      let rawData = ''
      res.on('data', chunk => { rawData += chunk })
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const data = JSON.parse(rawData)
            if (Array.isArray(data) && data[0]?.tag_name) {
              cachedLatestVersion = data[0].tag_name
              lastVersionFetchTime = now
              resolve(cachedLatestVersion)
              return
            }
          }
        } catch (_) {}
        resolve(cachedLatestVersion || 'Nightly')
      })
    })

    req.on('error', () => resolve(cachedLatestVersion || 'Nightly'))
    req.on('timeout', () => {
      req.destroy()
      resolve(cachedLatestVersion || 'Nightly')
    })
  })
}

/**
 * Returns full status of OpenAsar & Discord
 */
export async function getOpenAsarStatus(): Promise<OpenAsarStatus> {
  const isDiscordInstalled = checkDiscordInstalled()
  const isOpenAsarInstalled = checkOpenAsarInstalled()
  const latestVersion = await fetchLatestOpenAsarVersion()
  const resDir = getDiscordResourcesDir()

  return {
    isDiscordInstalled,
    isOpenAsarInstalled,
    version: isOpenAsarInstalled ? 'Nightly' : undefined,
    latestVersion,
    installPath: resDir || undefined,
    isInstalling: isCurrentlyInstalling,
  }
}

/**
 * Kills all running Discord processes so files can be safely replaced without locks
 */
function killDiscord(): Promise<void> {
  return new Promise((resolve) => {
    const targets = ['Discord.exe', 'DiscordCanary.exe', 'DiscordPTB.exe', 'DiscordDevelopment.exe', 'DiscordSystemHelper.exe', 'Update.exe']
    const taskkillCmd = targets.map(t => `taskkill /F /IM ${t} /T 2>nul`).join(' & ')
    
    exec(taskkillCmd, { windowsHide: true }, () => {
      // Also invoke PowerShell Stop-Process as a second barrier to ensure zero leftover handles
      const psCmd = 'powershell -NoProfile -Command "Stop-Process -Name Discord, DiscordCanary, DiscordPTB, DiscordDevelopment, DiscordSystemHelper, Update -Force -ErrorAction SilentlyContinue"'
      exec(psCmd, { windowsHide: true }, () => {
        setTimeout(resolve, 1000)
      })
    })
  })
}

/**
 * Localization helper for OpenAsar console logs
 */
function t(key: string, lang: string = 'en', ...args: (string | number)[]): string {
  const isDe = (lang || 'en') === 'de'
  switch (key) {
    case 'alreadyRunning':
      return isDe ? 'Installation läuft bereits' : 'Installation is already in progress'
    case 'discordNotFound':
      return isDe ? 'Discord-Installationsverzeichnis wurde nicht gefunden.' : 'Discord installation directory was not found.'
    case 'preparing':
      return isDe ? '[OpenAsar] Bereite Installation vor...' : '[OpenAsar] Preparing installation...'
    case 'closingDiscord':
      return isDe ? '[OpenAsar] Schließe Discord-Prozesse...' : '[OpenAsar] Closing Discord processes...'
    case 'downloadingAsar':
      return isDe ? '[OpenAsar] Lade OpenAsar (Nightly) herunter...' : '[OpenAsar] Downloading OpenAsar (Nightly)...'
    case 'downloadFailed':
      return isDe ? 'Download von OpenAsar fehlgeschlagen' : 'Download of OpenAsar failed'
    case 'backingUp':
      return isDe ? '[OpenAsar] Sichere originales Discord app.asar...' : '[OpenAsar] Backing up original Discord app.asar...'
    case 'applying':
      return isDe ? '[OpenAsar] Installiere OpenAsar in Discord...' : '[OpenAsar] Installing OpenAsar into Discord...'
    case 'installSuccess':
      return isDe 
        ? '[OpenAsar] OpenAsar erfolgreich installiert! Starte Discord neu, um den Geschwindigkeits- und RAM-Schub zu nutzen.' 
        : '[OpenAsar] OpenAsar installed successfully! Restart Discord to enjoy faster launch times and lower RAM usage.'
    case 'installFailed':
      return isDe ? 'OpenAsar-Installation fehlgeschlagen' : 'OpenAsar installation failed'
    case 'uninstalling':
      return isDe ? '[OpenAsar] Deinstalliere OpenAsar und stelle originales Discord app.asar wieder her...' : '[OpenAsar] Uninstalling OpenAsar and restoring original Discord app.asar...'
    case 'restoringBackup':
      return isDe ? '[OpenAsar] Stelle gesichertes Discord-Original wieder her...' : '[OpenAsar] Restoring backed up Discord original...'
    case 'uninstallSuccess':
      return isDe 
        ? '[OpenAsar] OpenAsar deinstalliert! Originaler Discord-Client wurde wiederhergestellt.' 
        : '[OpenAsar] OpenAsar uninstalled! Original Discord client restored.'
    case 'noBackupFound':
      return isDe ? 'Keine Original-Sicherung gefunden' : 'No original backup found'
    case 'unexpectedError':
      return isDe ? `[OpenAsar] Unerwarteter Fehler: ${args[0]}` : `[OpenAsar] Unexpected error: ${args[0]}`
    default:
      return key
  }
}

/**
 * Initializes IPC handlers for OpenAsar
 */
export function initOpenAsarIPC(getWindows: () => BrowserWindow[]) {
  let currentLang = 'en'

  const sendLog = (text: string) => {
    const wins = getWindows()
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('openasar:log', text)
      }
    }
  }

  const broadcastStatus = (st: string) => {
    const wins = getWindows()
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('openasar:status', st)
      }
    }
  }

  // 1. Get Status
  ipcMain.handle('openasar:get-status', async () => {
    return await getOpenAsarStatus()
  })

  // 2. Install OpenAsar
  ipcMain.handle('openasar:install', async (_event, lang?: string) => {
    if (lang) currentLang = lang
    const activeLang = lang || currentLang

    if (isCurrentlyInstalling) return { success: false, error: t('alreadyRunning', activeLang) }
    isCurrentlyInstalling = true

    try {
      if (!checkDiscordInstalled()) {
        isCurrentlyInstalling = false
        broadcastStatus('error')
        return { success: false, error: t('discordNotFound', activeLang) }
      }

      const resDir = getDiscordResourcesDir()
      if (!resDir) {
        isCurrentlyInstalling = false
        broadcastStatus('error')
        return { success: false, error: t('discordNotFound', activeLang) }
      }

      broadcastStatus('downloading')
      sendLog(t('preparing', activeLang))

      // Determine targets depending on Vencord setup
      // With Vencord: app.asar is Vencord loader (~219 B), _app.asar is the Discord core (OpenAsar replaces this).
      // Without Vencord: app.asar is Discord core (OpenAsar replaces this).
      const appAsarPath = path.join(resDir, 'app.asar')
      const underAppAsarPath = path.join(resDir, '_app.asar')
      
      const isVencordSetup = safeFsOp(() => {
        if (fs.existsSync(underAppAsarPath)) return true
        if (fs.existsSync(appAsarPath)) {
          const sz = fs.statSync(appAsarPath).size
          if (sz < 2000) return true
        }
        return false
      })

      const targetFile = isVencordSetup ? underAppAsarPath : appAsarPath
      const backupFile = isVencordSetup 
        ? path.join(resDir, '_app.asar.backup') 
        : path.join(resDir, 'app.asar.backup')

      // Terminate Discord to release locks
      sendLog(t('closingDiscord', activeLang))
      await killDiscord()

      // Download OpenAsar Nightly
      sendLog(t('downloadingAsar', activeLang))
      const tempDir = process.env.TEMP || process.env.TMP || ''
      const tempAsar = path.join(tempDir, `openasar_dl_${Date.now()}.asar`)

      const downloaded = await downloadFile(OPENASAR_DOWNLOAD_URL, tempAsar)
      if (!downloaded || !safeFsOp(() => fs.existsSync(tempAsar))) {
        isCurrentlyInstalling = false
        broadcastStatus('error')
        return { success: false, error: t('downloadFailed', activeLang) }
      }

      broadcastStatus('installing')
      sendLog(t('applying', activeLang))

      // Check if target file exists and backup original Discord if not already backed up
      safeFsOp(() => {
        if (fs.existsSync(targetFile)) {
          const currentSize = fs.statSync(targetFile).size
          // Only back up if target is original Discord (> 500 KB) and backup doesn't already exist
          if (!fs.existsSync(backupFile) && currentSize > 500 * 1024) {
            sendLog(t('backingUp', activeLang))
            fs.copyFileSync(targetFile, backupFile)
          }
        }
      })

      // Replace target file with retry logic to withstand file locking
      let replaced = false
      let lastErr: any = null
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          safeFsOp(() => {
            fs.copyFileSync(tempAsar, targetFile)
          })
          replaced = true
          break
        } catch (err: any) {
          lastErr = err
          if (attempt < 5) {
            await killDiscord()
            await new Promise(r => setTimeout(r, 600))
          }
        }
      }

      // Cleanup temp download
      safeFsOp(() => {
        try { fs.unlinkSync(tempAsar) } catch (_) {}
      })

      isCurrentlyInstalling = false

      if (replaced) {
        sendLog(t('installSuccess', activeLang))
        broadcastStatus('done')
        return { success: true }
      } else {
        broadcastStatus('error')
        const errMsg = lastErr?.message || t('installFailed', activeLang)
        sendLog(`[Error] ${errMsg}`)
        return { success: false, error: errMsg }
      }
    } catch (err: any) {
      isCurrentlyInstalling = false
      broadcastStatus('error')
      sendLog(t('unexpectedError', activeLang, err?.message))
      return { success: false, error: err?.message }
    }
  })

  // 3. Uninstall OpenAsar
  ipcMain.handle('openasar:uninstall', async (_event, lang?: string) => {
    if (lang) currentLang = lang
    const activeLang = lang || currentLang

    try {
      const resDir = getDiscordResourcesDir()
      if (!resDir) return { success: false, error: t('discordNotFound', activeLang) }

      sendLog(t('closingDiscord', activeLang))
      await killDiscord()

      sendLog(t('uninstalling', activeLang))

      const underBackup = path.join(resDir, '_app.asar.backup')
      const mainBackup = path.join(resDir, 'app.asar.backup')
      const underTarget = path.join(resDir, '_app.asar')
      const mainTarget = path.join(resDir, 'app.asar')

      let restored = false

      safeFsOp(() => {
        if (fs.existsSync(underBackup)) {
          sendLog(t('restoringBackup', activeLang))
          fs.copyFileSync(underBackup, underTarget)
          try { fs.unlinkSync(underBackup) } catch (_) {}
          restored = true
        } else if (fs.existsSync(mainBackup)) {
          sendLog(t('restoringBackup', activeLang))
          fs.copyFileSync(mainBackup, mainTarget)
          try { fs.unlinkSync(mainBackup) } catch (_) {}
          restored = true
        }
      })

      if (restored) {
        sendLog(t('uninstallSuccess', activeLang))
        broadcastStatus('done')
        return { success: true }
      } else {
        // Fallback: If no local backup file, inform user
        broadcastStatus('error')
        sendLog(`[OpenAsar] ${t('noBackupFound', activeLang)}`)
        return { success: false, error: t('noBackupFound', activeLang) }
      }
    } catch (e: any) {
      broadcastStatus('error')
      return { success: false, error: e?.message }
    }
  })

  // 4. Open Discord resources folder
  ipcMain.handle('openasar:open-folder', async () => {
    const resDir = getDiscordResourcesDir()
    const target = resDir || getDiscordBaseDir()
    try {
      if (safeFsOp(() => fs.existsSync(target))) {
        await shell.openPath(target)
        return { success: true }
      }
      return { success: false, error: 'Folder not found' }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })

  // 5. Open OpenAsar GitHub Repository in Browser
  ipcMain.handle('openasar:open-github', async () => {
    try {
      await shell.openExternal('https://github.com/GooseMod/OpenAsar')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })
}
