import { ipcMain, BrowserWindow, shell } from 'electron'
import { spawn, exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'

export interface MillenniumStatus {
  isSteamInstalled: boolean
  isMillenniumInstalled: boolean
  version?: string
  latestVersion?: string
  installPath?: string
  steamPath?: string
  isInstalling?: boolean
}

let isCurrentlyInstalling = false
let cachedLatestVersion: string = 'v3.4.1'
let lastVersionFetchTime = 0

/**
 * Resolves the Steam installation directory from Windows Registry or common paths
 */
export function getSteamDir(): string {
  // 1. Try environment/standard Program Files locations
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const candidate1 = path.join(progFilesX86, 'Steam')
  if (fs.existsSync(candidate1) && fs.existsSync(path.join(candidate1, 'steam.exe'))) {
    return candidate1
  }

  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const candidate2 = path.join(progFiles, 'Steam')
  if (fs.existsSync(candidate2) && fs.existsSync(path.join(candidate2, 'steam.exe'))) {
    return candidate2
  }

  // 2. Query registry via synchronous PowerShell / reg query
  try {
    const stdout = require('child_process').execSync('reg query HKCU\\Software\\Valve\\Steam /v SteamPath', {
      windowsHide: true,
      encoding: 'utf8'
    })
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.*)/i)
    if (match && match[1]) {
      const regPath = match[1].trim().replace(/\//g, '\\')
      if (fs.existsSync(regPath)) return regPath
    }
  } catch (_) {}

  return candidate1
}

/**
 * Checks if Steam is installed on this PC
 */
function checkSteamInstalled(): boolean {
  const dir = getSteamDir()
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'steam.exe'))
}

/**
 * Checks if Millennium is installed in Steam
 */
function checkMillenniumInstalled(): boolean {
  const steamDir = getSteamDir()
  const wsockPath = path.join(steamDir, 'wsock32.dll')
  const millenniumDir = path.join(steamDir, 'millennium')

  return fs.existsSync(wsockPath) || fs.existsSync(millenniumDir)
}

/**
 * Reads the installed Millennium version from local metadata or DLL
 */
function getInstalledMillenniumVersion(): string | undefined {
  const steamDir = getSteamDir()
  const metaPath = path.join(steamDir, 'millennium', 'eclipse-version.json')
  try {
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      if (data.version) return data.version
    }
  } catch (_) {}

  // Check version of millennium.dll if available
  const dllPath = path.join(steamDir, 'millennium', 'lib', 'millennium.dll')
  if (fs.existsSync(dllPath)) {
    return cachedLatestVersion || 'v3.4.1'
  }

  return undefined
}

/**
 * Fetches the latest release version tag from GitHub
 */
async function fetchLatestMillenniumVersion(): Promise<string> {
  const now = Date.now()
  if (cachedLatestVersion && (now - lastVersionFetchTime < 10 * 60 * 1000)) {
    return cachedLatestVersion
  }

  return new Promise((resolve) => {
    const req = https.get('https://api.github.com/repos/SteamClientHomebrew/Millennium/releases/latest', {
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
            if (data.tag_name) {
              const tag = data.tag_name.startsWith('v') ? data.tag_name : `v${data.tag_name}`
              cachedLatestVersion = tag
              lastVersionFetchTime = now
              resolve(tag)
              return
            }
          }
        } catch (_) {}
        resolve(cachedLatestVersion || 'v3.4.1')
      })
    })

    req.on('error', () => resolve(cachedLatestVersion || 'v3.4.1'))
    req.on('timeout', () => {
      req.destroy()
      resolve(cachedLatestVersion || 'v3.4.1')
    })
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
 * Kills running Steam processes so files can be replaced without lock errors
 */
function killSteam(): Promise<void> {
  return new Promise((resolve) => {
    exec('taskkill /F /IM steam.exe /T', { windowsHide: true }, () => {
      // Small pause to allow file handles to be released
      setTimeout(resolve, 800)
    })
  })
}

/**
 * Returns full status of Millennium & Steam
 */
export async function getMillenniumStatus(): Promise<MillenniumStatus> {
  const isSteamInstalled = checkSteamInstalled()
  const isMillenniumInstalled = checkMillenniumInstalled()
  const latestVersion = await fetchLatestMillenniumVersion()
  const installedVer = isMillenniumInstalled ? getInstalledMillenniumVersion() : undefined
  const steamDir = getSteamDir()

  return {
    isSteamInstalled,
    isMillenniumInstalled,
    version: installedVer || (isMillenniumInstalled ? latestVersion : undefined),
    latestVersion,
    installPath: path.join(steamDir, 'millennium'),
    steamPath: steamDir,
    isInstalling: isCurrentlyInstalling,
  }
}

/**
 * Localization dictionary for Millennium console logs and errors
 */
function t(key: string, lang: string = 'en', ...args: (string | number)[]): string {
  const isDe = (lang || 'en') === 'de'
  switch (key) {
    case 'alreadyRunning':
      return isDe ? 'Installation läuft bereits' : 'Installation is already in progress'
    case 'steamNotFound':
      return isDe ? 'Steam-Installationsverzeichnis wurde nicht gefunden.' : 'Steam installation directory was not found.'
    case 'closingSteam':
      return isDe ? '[Millennium] Schließe Steam-Prozess...' : '[Millennium] Closing Steam process...'
    case 'fetchingRelease':
      return isDe ? '[Millennium] Frage neuestes Release von GitHub ab...' : '[Millennium] Fetching latest release from GitHub...'
    case 'downloading':
      return isDe 
        ? `[Millennium] Lade ${args[0]} herunter (${args[1]})...` 
        : `[Millennium] Downloading ${args[0]} (${args[1]})...`
    case 'altDownload':
      return isDe 
        ? `[Millennium] Versuche alternativen Download-Pfad: ${args[0]}` 
        : `[Millennium] Trying alternative download path: ${args[0]}`
    case 'downloadFailed':
      return isDe 
        ? '[Millennium] Fehler: Download des Millennium-Pakets fehlgeschlagen.' 
        : '[Millennium] Error: Download of Millennium package failed.'
    case 'downloadFailedErr':
      return isDe 
        ? 'Download des Millennium-Pakets fehlgeschlagen.' 
        : 'Download of Millennium package failed.'
    case 'extracting':
      return isDe 
        ? `[Millennium] Entpacke Dateien nach ${args[0]}...` 
        : `[Millennium] Extracting files to ${args[0]}...`
    case 'extractFailed':
      return isDe 
        ? '[Millennium] Fehler beim Entpacken der Dateien in das Steam-Verzeichnis.' 
        : '[Millennium] Error extracting files to Steam directory.'
    case 'extractFailedErr':
      return isDe 
        ? 'Dateien konnten nicht in das Steam-Verzeichnis entpackt werden.' 
        : 'Could not extract files to Steam directory.'
    case 'installSuccess':
      return isDe 
        ? `[Millennium] ${args[0]} erfolgreich installiert! Starte Steam neu, um das Millennium-Menü aufzurufen.` 
        : `[Millennium] ${args[0]} successfully installed! Restart Steam to access the Millennium menu.`
    case 'unexpectedError':
      return isDe 
        ? `[Millennium] Unerwarteter Fehler: ${args[0]}` 
        : `[Millennium] Unexpected error: ${args[0]}`
    case 'unexpectedErrorErr':
      return isDe ? 'Unerwarteter Fehler' : 'Unexpected error'
    case 'startRepair':
      return isDe 
        ? '[Millennium] Starte Aktualisierung / Reparatur...' 
        : '[Millennium] Starting update / repair...'
    case 'closingSteamUninstall':
      return isDe 
        ? '[Millennium] Schließe Steam-Prozess vor Deinstallation...' 
        : '[Millennium] Closing Steam process before uninstallation...'
    case 'removingFiles':
      return isDe 
        ? '[Millennium] Entferne Millennium-Dateien aus dem Steam-Verzeichnis...' 
        : '[Millennium] Removing Millennium files from Steam directory...'
    case 'deletedFile':
      return isDe 
        ? `[Millennium] Gelöscht: ${args[0]}` 
        : `[Millennium] Deleted: ${args[0]}`
    case 'fileNotice':
      return isDe 
        ? `[Millennium] Hinweis zu ${args[0]}: ${args[1]}` 
        : `[Millennium] Notice for ${args[0]}: ${args[1]}`
    case 'folderDeleted':
      return isDe 
        ? '[Millennium] Ordner millennium/ gelöscht.' 
        : '[Millennium] Folder millennium/ deleted.'
    case 'folderDeleteError':
      return isDe 
        ? `[Millennium] Fehler beim Löschen von millennium/: ${args[0]}` 
        : `[Millennium] Error deleting millennium/: ${args[0]}`
    case 'uninstallSuccess':
      return isDe 
        ? '[Millennium] Steam wurde vollständig in den Originalzustand zurückversetzt.' 
        : '[Millennium] Steam has been completely restored to its original state.'
    case 'uninstallError':
      return isDe 
        ? `[Millennium] Fehler bei der Deinstallation: ${args[0]}` 
        : `[Millennium] Error during uninstallation: ${args[0]}`
    case 'downloadingInstaller':
      return isDe 
        ? '[Millennium] Lade offiziellen Millennium-Installer herunter...' 
        : '[Millennium] Downloading official Millennium installer...'
    case 'installerDownloadFailed':
      return isDe 
        ? 'Download des offiziellen Installers fehlgeschlagen.' 
        : 'Download of official installer failed.'
    case 'startingInstaller':
      return isDe 
        ? '[Millennium] Starte offiziellen Millennium-Installer...' 
        : '[Millennium] Launching official Millennium installer...'
    default:
      return key
  }
}

/**
 * Initializes IPC handlers for Millennium
 */
export function initMillenniumIPC(getWindows: () => BrowserWindow[]) {
  let currentLang = 'en'

  const sendLog = (text: string) => {
    const wins = getWindows()
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('millennium:log', text)
      }
    }
  }

  const broadcastStatus = (st: string) => {
    const wins = getWindows()
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('millennium:status', st)
      }
    }
  }

  async function performInstallation(lang: string = currentLang): Promise<{ success: boolean; error?: string }> {
    if (isCurrentlyInstalling) return { success: false, error: t('alreadyRunning', lang) }
    isCurrentlyInstalling = true

    try {
      const steamDir = getSteamDir()
      if (!fs.existsSync(steamDir)) {
        isCurrentlyInstalling = false
        broadcastStatus('error')
        return { success: false, error: t('steamNotFound', lang) }
      }

      broadcastStatus('preparing')
      sendLog(t('closingSteam', lang))
      await killSteam()

      broadcastStatus('downloading')
      sendLog(t('fetchingRelease', lang))
      const tag = await fetchLatestMillenniumVersion()
      const cleanTag = tag.replace(/^v/, '')

      const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp'
      const zipPath = path.join(tempDir, `millennium-${tag}-windows-x86_64.zip`)
      const downloadUrl = `https://github.com/SteamClientHomebrew/Millennium/releases/download/${tag}/millennium-${tag}-windows-x86_64.zip`

      sendLog(t('downloading', lang, tag, downloadUrl))
      let downloadOk = await downloadFile(downloadUrl, zipPath)

      // Fallback with 'v' or without 'v' in asset name if needed
      if (!downloadOk) {
        const altUrl = `https://github.com/SteamClientHomebrew/Millennium/releases/download/${tag}/millennium-${cleanTag}-windows-x86_64.zip`
        sendLog(t('altDownload', lang, altUrl))
        downloadOk = await downloadFile(altUrl, zipPath)
      }

      if (!downloadOk || !fs.existsSync(zipPath)) {
        isCurrentlyInstalling = false
        broadcastStatus('error')
        sendLog(t('downloadFailed', lang))
        return { success: false, error: t('downloadFailedErr', lang) }
      }

      broadcastStatus('extracting')
      sendLog(t('extracting', lang, steamDir))

      // Extract using tar (built into modern Windows) or PowerShell
      const extractSuccess = await new Promise<boolean>((res) => {
        const cmd = `tar -xf "${zipPath}" -C "${steamDir}"`
        exec(cmd, { windowsHide: true }, (err) => {
          if (!err) {
            res(true)
          } else {
            // Fallback to PowerShell Expand-Archive
            const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${steamDir}' -Force"`
            exec(psCmd, { windowsHide: true }, (psErr) => {
              res(!psErr)
            })
          }
        })
      })

      if (!extractSuccess) {
        isCurrentlyInstalling = false
        broadcastStatus('error')
        sendLog(t('extractFailed', lang))
        return { success: false, error: t('extractFailedErr', lang) }
      }

      // Ensure skins directories exist
      const skinsDir = path.join(steamDir, 'steamui', 'skins')
      const legacySkinsDir = path.join(steamDir, 'skins')
      try {
        if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true })
        if (!fs.existsSync(legacySkinsDir)) fs.mkdirSync(legacySkinsDir, { recursive: true })
      } catch (_) {}

      // Write version metadata
      try {
        const millenniumDir = path.join(steamDir, 'millennium')
        if (!fs.existsSync(millenniumDir)) fs.mkdirSync(millenniumDir, { recursive: true })
        fs.writeFileSync(
          path.join(millenniumDir, 'eclipse-version.json'),
          JSON.stringify({ version: tag, installedAt: Date.now() }, null, 2),
          'utf8'
        )
      } catch (_) {}

      // Cleanup zip
      try { fs.unlinkSync(zipPath) } catch (_) {}

      sendLog(t('installSuccess', lang, tag))
      isCurrentlyInstalling = false
      broadcastStatus('done')
      return { success: true }
    } catch (err: any) {
      isCurrentlyInstalling = false
      broadcastStatus('error')
      sendLog(t('unexpectedError', lang, err?.message))
      return { success: false, error: err?.message || t('unexpectedErrorErr', lang) }
    }
  }

  // 1. Get Status
  ipcMain.handle('millennium:get-status', async () => {
    return await getMillenniumStatus()
  })

  // 2. 1-Click Install Millennium
  ipcMain.handle('millennium:install', async (_event, lang?: string) => {
    if (lang) currentLang = lang
    return await performInstallation(lang || currentLang)
  })

  // 3. Repair / Update Millennium
  ipcMain.handle('millennium:repair', async (_event, lang?: string) => {
    if (lang) currentLang = lang
    sendLog(t('startRepair', lang || currentLang))
    return await performInstallation(lang || currentLang)
  })

  // 4. 1-Click Uninstall Millennium
  ipcMain.handle('millennium:uninstall', async (_event, lang?: string) => {
    if (lang) currentLang = lang
    const activeLang = lang || currentLang
    try {
      const steamDir = getSteamDir()
      sendLog(t('closingSteamUninstall', activeLang))
      await killSteam()

      sendLog(t('removingFiles', activeLang))

      // 1. Remove proxy DLLs
      const filesToRemove = [
        path.join(steamDir, 'wsock32.dll'),
        path.join(steamDir, 'user32.dll'),
        path.join(steamDir, 'version.dll'),
        path.join(steamDir, 'millennium.dll'),
        path.join(steamDir, 'millennium.hhx64.dll')
      ]

      for (const file of filesToRemove) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file)
            sendLog(t('deletedFile', activeLang, path.basename(file)))
          }
        } catch (e: any) {
          sendLog(t('fileNotice', activeLang, path.basename(file), e.message))
        }
      }

      // 2. Remove millennium directory
      const millenniumDir = path.join(steamDir, 'millennium')
      if (fs.existsSync(millenniumDir)) {
        try {
          fs.rmSync(millenniumDir, { recursive: true, force: true })
          sendLog(t('folderDeleted', activeLang))
        } catch (e: any) {
          sendLog(t('folderDeleteError', activeLang, e.message))
        }
      }

      sendLog(t('uninstallSuccess', activeLang))
      broadcastStatus('done')
      return { success: true }
    } catch (e: any) {
      sendLog(t('uninstallError', activeLang, e?.message))
      return { success: false, error: e?.message }
    }
  })

  // 5. Open Skins / Themes folder
  ipcMain.handle('millennium:open-themes', async () => {
    const steamDir = getSteamDir()
    const candidates = [
      path.join(steamDir, 'steamui', 'skins'),
      path.join(steamDir, 'skins'),
      path.join(steamDir, 'millennium', 'skins')
    ]

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        await shell.openPath(dir)
        return { success: true }
      }
    }

    // If none exist, create steamui/skins and open
    const target = path.join(steamDir, 'steamui', 'skins')
    try {
      fs.mkdirSync(target, { recursive: true })
      await shell.openPath(target)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })

  // 6. Open Steambrew Themes Store in Browser
  ipcMain.handle('millennium:open-store', async () => {
    try {
      await shell.openExternal('https://steambrew.app/themes')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })

  // 7. Open Millennium root directory
  ipcMain.handle('millennium:open-folder', async () => {
    const steamDir = getSteamDir()
    const millenniumDir = path.join(steamDir, 'millennium')
    const target = fs.existsSync(millenniumDir) ? millenniumDir : steamDir
    try {
      await shell.openPath(target)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })

  // 8. Launch official standalone Millennium Installer GUI
  ipcMain.handle('millennium:launch-installer', async (_event, lang?: string) => {
    if (lang) currentLang = lang
    const activeLang = lang || currentLang
    const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp'
    const installerPath = path.join(tempDir, 'MillenniumInstaller.exe')

    sendLog(t('downloadingInstaller', activeLang))
    const downloadOk = await downloadFile(
      'https://github.com/SteamClientHomebrew/Installer/releases/latest/download/MillenniumInstaller-Windows.exe',
      installerPath
    )

    if (!downloadOk || !fs.existsSync(installerPath)) {
      return { success: false, error: t('installerDownloadFailed', activeLang) }
    }

    sendLog(t('startingInstaller', activeLang))
    spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref()
    return { success: true }
  })
}
