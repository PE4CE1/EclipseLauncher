import { ipcMain, BrowserWindow, shell } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'
import * as standardFs from 'fs'
import * as https from 'https'

// @ts-ignore
import * as originalFs from 'original-fs'

const fs: typeof standardFs = (originalFs && typeof (originalFs as any).existsSync === 'function')
  ? (originalFs as any)
  : standardFs

function safeFsOp<T>(fn: () => T): T {
  const prev = (process as any).noAsar
  ;(process as any).noAsar = true
  try {
    return fn()
  } finally {
    ;(process as any).noAsar = prev
  }
}

export interface VencordStatus {
  isDiscordInstalled: boolean
  isVencordInstalled: boolean
  version?: string
  latestVersion?: string
  installPath?: string
  isInstalling?: boolean
}

let isCurrentlyInstalling = false
let cachedLatestVersion: string = 'v1.15.4'
let lastVersionFetchTime = 0

/**
 * Returns the Vencord data directory (%APPDATA%\Vencord)
 */
function getVencordDir(): string {
  const appData = process.env.APPDATA || ''
  return path.join(appData, 'Vencord')
}

/**
 * Returns the temporary CLI installer path
 */
function getInstallerCliPath(): string {
  const tempDir = process.env.TEMP || process.env.TMP || ''
  return path.join(tempDir, 'VencordInstallerCli.exe')
}

/**
 * Checks if Discord (Stable, PTB or Canary) is installed on Windows
 */
function checkDiscordInstalled(): boolean {
  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(localAppData, 'Discord'),
    path.join(localAppData, 'DiscordCanary'),
    path.join(localAppData, 'DiscordPTB'),
    path.join(localAppData, 'DiscordDevelopment'),
  ]

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      if (fs.existsSync(path.join(dir, 'Update.exe'))) return true
      try {
        const subdirs = fs.readdirSync(dir)
        if (subdirs.some(s => s.startsWith('app-'))) return true
      } catch (_) {}
    }
  }

  return false
}

/**
 * Checks if Vencord is patched and installed
 */
function checkVencordInstalled(): boolean {
  return safeFsOp(() => {
    const vencordDir = getVencordDir()
    if (fs.existsSync(path.join(vencordDir, 'dist'))) return true

    // Also check Discord resources for patched app or _app.asar
    const localAppData = process.env.LOCALAPPDATA || ''
    const discordDir = path.join(localAppData, 'Discord')
    if (fs.existsSync(discordDir)) {
      try {
        const entries = fs.readdirSync(discordDir)
        for (const entry of entries) {
          if (entry.startsWith('app-')) {
            const res = path.join(discordDir, entry, 'resources')
            if (fs.existsSync(path.join(res, '_app.asar')) || fs.existsSync(path.join(res, 'app'))) {
              return true
            }
          }
        }
      } catch (_) {}
    }

    return false
  })
}

/**
 * Reads the installed Vencord version from local files
 */
function getInstalledVencordVersion(): string | undefined {
  try {
    const rendererPath = path.join(getVencordDir(), 'dist', 'renderer.js')
    if (fs.existsSync(rendererPath)) {
      const content = fs.readFileSync(rendererPath, 'utf8')
      const match = content.match(/Vencord:\s*[`'"]?v?([0-9]+\.[0-9]+\.[0-9]+)/i)
      if (match && match[1]) {
        return `v${match[1]}`
      }
    }
  } catch (_) {}
  return undefined
}

/**
 * Fetches the latest release version tag from GitHub (Vendicated/Vencord tags)
 */
async function fetchLatestVencordVersion(): Promise<string> {
  const now = Date.now()
  // Cache for 10 minutes to respect GitHub rate limits
  if (cachedLatestVersion && (now - lastVersionFetchTime < 10 * 60 * 1000)) {
    return cachedLatestVersion
  }

  return new Promise((resolve) => {
    const req = https.get('https://api.github.com/repos/Vendicated/Vencord/tags', {
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
            const tags = JSON.parse(rawData)
            if (Array.isArray(tags) && tags.length > 0 && tags[0].name) {
              const tag = tags[0].name.startsWith('v') ? tags[0].name : `v${tags[0].name}`
              cachedLatestVersion = tag
              lastVersionFetchTime = now
              resolve(tag)
              return
            }
          }
        } catch (_) {}
        resolve(cachedLatestVersion || 'v1.15.4')
      })
    })

    req.on('error', () => resolve(cachedLatestVersion || 'v1.15.4'))
    req.on('timeout', () => {
      req.destroy()
      resolve(cachedLatestVersion || 'v1.15.4')
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
        timeout: 20000,
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
 * Runs a command and streams output to IPC
 */
function runCommandWithLogs(
  exePath: string,
  args: string[],
  getWindows: () => BrowserWindow[],
  onData?: (data: string) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false
    const done = (res: { success: boolean; error?: string }) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        resolve(res)
      }
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch (_) {}
      done({ success: false, error: 'Command timed out' })
    }, 45000)

    const child = spawn(exePath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    try {
      child.stdin.write('\r\n')
      child.stdin.end()
    } catch (_) {}

    const sendLog = (text: string) => {
      if (onData) onData(text)
      const wins = getWindows()
      for (const win of wins) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('vencord:log', text)
        }
      }
    }

    const onOutput = (data: any) => {
      const str = data.toString()
      sendLog(str)
      if (str.toLowerCase().includes('press enter')) {
        try {
          child.stdin.write('\r\n')
          child.stdin.end()
        } catch (_) {}
        setTimeout(() => {
          try { child.kill() } catch (_) {}
        }, 800)
      }
    }

    child.stdout.on('data', onOutput)
    child.stderr.on('data', onOutput)

    child.on('error', (err) => {
      sendLog(`[Fehler] ${err.message}`)
      done({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        done({ success: true })
      } else {
        done({ success: false, error: `Beendet mit Exit-Code ${code}` })
      }
    })
  })
}

/**
 * Returns complete Vencord status for settings UI
 */
export async function getVencordStatus(): Promise<VencordStatus> {
  const isDiscordInstalled = checkDiscordInstalled()
  const isVencordInstalled = checkVencordInstalled()
  const latestVersion = await fetchLatestVencordVersion()
  const installedVer = isVencordInstalled ? getInstalledVencordVersion() : undefined

  return {
    isDiscordInstalled,
    isVencordInstalled,
    version: installedVer || (isVencordInstalled ? latestVersion : undefined),
    latestVersion,
    installPath: getVencordDir(),
    isInstalling: isCurrentlyInstalling,
  }
}

/**
 * Initializes IPC handlers for Vencord
 */
export function initVencordIPC(getWindows: () => BrowserWindow[]) {
  // 1. Get Status
  ipcMain.handle('vencord:get-status', async () => {
    return await getVencordStatus()
  })

  // 2. Install Vencord
  ipcMain.handle('vencord:install', async () => {
    if (isCurrentlyInstalling) return { success: false, error: 'Installation läuft bereits' }
    isCurrentlyInstalling = true

    const broadcast = (st: string) => {
      const wins = getWindows()
      for (const win of wins) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('vencord:status', st)
        }
      }
    }

    try {
      broadcast('downloading')
      const cliPath = getInstallerCliPath()
      const downloadSuccess = await downloadFile(
        'https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe',
        cliPath
      )

      if (!downloadSuccess) {
        isCurrentlyInstalling = false
        broadcast('error')
        return { success: false, error: 'Download des Vencord-Installers fehlgeschlagen' }
      }

      broadcast('installing')
      const installRes = await runCommandWithLogs(cliPath, ['-install', '-branch', 'auto'], getWindows)

      isCurrentlyInstalling = false
      if (installRes.success) {
        broadcast('done')
        return { success: true }
      } else {
        broadcast('error')
        return { success: false, error: installRes.error || 'Vencord-Installation fehlgeschlagen' }
      }
    } catch (err: any) {
      isCurrentlyInstalling = false
      broadcast('error')
      return { success: false, error: err?.message || 'Unerwarteter Fehler' }
    }
  })

  // 3. Repair / Update Vencord
  ipcMain.handle('vencord:repair', async () => {
    const cliPath = getInstallerCliPath()
    if (!fs.existsSync(cliPath)) {
      const ok = await downloadFile(
        'https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe',
        cliPath
      )
      if (!ok) return { success: false, error: 'Download des Vencord-Installers fehlgeschlagen' }
    }

    return await runCommandWithLogs(cliPath, ['-repair', '-branch', 'auto'], getWindows)
  })

  // 4. Uninstall Vencord
  ipcMain.handle('vencord:uninstall', async () => {
    const cliPath = getInstallerCliPath()
    if (!fs.existsSync(cliPath)) {
      const ok = await downloadFile(
        'https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe',
        cliPath
      )
      if (!ok) return { success: false, error: 'Download des Vencord-Installers fehlgeschlagen' }
    }

    return await runCommandWithLogs(cliPath, ['-uninstall', '-branch', 'auto'], getWindows)
  })

  // 5. Open Themes directory
  ipcMain.handle('vencord:open-themes', async () => {
    const vencordDir = getVencordDir()
    const themesDir = path.join(vencordDir, 'themes')
    try {
      if (!fs.existsSync(themesDir)) {
        fs.mkdirSync(themesDir, { recursive: true })
      }
      await shell.openPath(themesDir)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })

  // 6. Open Vencord root directory
  ipcMain.handle('vencord:open-folder', async () => {
    const vencordDir = getVencordDir()
    try {
      if (!fs.existsSync(vencordDir)) {
        fs.mkdirSync(vencordDir, { recursive: true })
      }
      await shell.openPath(vencordDir)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message }
    }
  })
}
