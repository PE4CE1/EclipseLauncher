import { ipcMain, BrowserWindow, shell } from 'electron'
import { spawn, exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

export interface SpicetifyStatus {
  isSpotifyInstalled: boolean
  isSpicetifyInstalled: boolean
  version?: string
  installPath?: string
  hasMarketplace?: boolean
  isInstalling?: boolean
}

let isCurrentlyInstalling = false

/**
 * Returns the default Spicetify installation directory
 */
function getSpicetifyDir(): string {
  const localAppData = process.env.LOCALAPPDATA || ''
  const primary = path.join(localAppData, 'spicetify')
  if (fs.existsSync(primary)) return primary

  const appData = process.env.APPDATA || ''
  const secondary = path.join(appData, 'spicetify')
  if (fs.existsSync(secondary)) return secondary

  return primary
}

/**
 * Returns the path to the Spicetify executable
 */
function getSpicetifyExe(): string {
  const dir = getSpicetifyDir()
  return path.join(dir, 'spicetify.exe')
}

/**
 * Checks if the official Spotify client is installed on Windows
 */
function checkSpotifyInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const appData = process.env.APPDATA || ''
    const localAppData = process.env.LOCALAPPDATA || ''

    // 1. Regular desktop installer
    const regularPath = path.join(appData, 'Spotify', 'Spotify.exe')
    if (fs.existsSync(regularPath)) {
      resolve(true)
      return
    }

    // 2. Windows Apps alias
    const aliasPath = path.join(localAppData, 'Microsoft', 'WindowsApps', 'Spotify.exe')
    if (fs.existsSync(aliasPath)) {
      resolve(true)
      return
    }

    // 3. Microsoft Store package
    const packagesDir = path.join(localAppData, 'Packages')
    if (fs.existsSync(packagesDir)) {
      try {
        const list = fs.readdirSync(packagesDir)
        if (list.some(name => name.toLowerCase().startsWith('spotifyab.spotifymusic'))) {
          resolve(true)
          return
        }
      } catch (_) {}
    }

    // 4. Command line check
    exec('where.exe spotify', { windowsHide: true }, (err) => {
      resolve(!err)
    })
  })
}

/**
 * Checks Spicetify installation and reads version
 */
export async function getSpicetifyStatus(): Promise<SpicetifyStatus> {
  const isSpotifyInstalled = await checkSpotifyInstalled()
  const exePath = getSpicetifyExe()
  const exists = fs.existsSync(exePath)

  if (!exists) {
    return {
      isSpotifyInstalled,
      isSpicetifyInstalled: false,
      isInstalling: isCurrentlyInstalling,
    }
  }

  // Check version and marketplace folder
  const dir = getSpicetifyDir()
  const customAppsDir = path.join(dir, 'CustomApps', 'marketplace')
  const hasMarketplace = fs.existsSync(customAppsDir)

  let version: string | undefined = undefined
  try {
    const versionOutput = await new Promise<string>((resolve) => {
      exec(`"${exePath}" -v`, { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) resolve('')
        else resolve(stdout.trim())
      })
    })
    if (versionOutput) version = versionOutput
  } catch (_) {}

  return {
    isSpotifyInstalled,
    isSpicetifyInstalled: true,
    version: version || 'Installiert',
    installPath: dir,
    hasMarketplace,
    isInstalling: isCurrentlyInstalling,
  }
}

/**
 * Runs a PowerShell script and streams log events to webContents
 */
function runPowerShellScript(
  command: string,
  getWindows: () => BrowserWindow[],
  onData?: (data: string) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', command
    ], {
      windowsHide: true,
      env: { ...process.env }
    })

    const sendLog = (text: string) => {
      if (onData) onData(text)
      const wins = getWindows()
      for (const win of wins) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('spicetify:log', text)
        }
      }
    }

    ps.stdout.on('data', (data) => {
      sendLog(data.toString())
    })

    ps.stderr.on('data', (data) => {
      sendLog(data.toString())
    })

    ps.on('error', (err) => {
      sendLog(`[Fehler] ${err.message}`)
      resolve({ success: false, error: err.message })
    })

    ps.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Beendet mit Code ${code}` })
      }
    })
  })
}

export function initSpicetifyIPC(getWindows: () => BrowserWindow[]) {
  // 1. Get Status
  ipcMain.handle('spicetify:get-status', async () => {
    return await getSpicetifyStatus()
  })

  // 2. 1-Click Install Spicetify + Marketplace
  ipcMain.handle('spicetify:install', async () => {
    if (isCurrentlyInstalling) return { success: false, error: 'Installation läuft bereits' }
    isCurrentlyInstalling = true

    const broadcast = (status: string) => {
      const wins = getWindows()
      for (const win of wins) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('spicetify:status', status)
        }
      }
    }

    try {
      broadcast('installing-cli')
      // Step 1: Install Spicetify CLI
      const cliResult = await runPowerShellScript(
        `iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/dists/get.ps1 | iex`,
        getWindows
      )

      if (!cliResult.success) {
        isCurrentlyInstalling = false
        broadcast('error')
        return { success: false, error: cliResult.error || 'Fehler beim Laden von Spicetify CLI' }
      }

      broadcast('installing-marketplace')
      // Step 2: Install Spicetify Marketplace
      const marketResult = await runPowerShellScript(
        `iwr -useb https://raw.githubusercontent.com/spicetify/marketplace/main/resources/install.ps1 | iex`,
        getWindows
      )

      broadcast('applying')
      // Step 3: Run backup apply
      const exe = getSpicetifyExe()
      if (fs.existsSync(exe)) {
        await runPowerShellScript(
          `& "${exe}" backup apply`,
          getWindows
        )
      }

      isCurrentlyInstalling = false
      broadcast('done')
      return { success: true }
    } catch (err: any) {
      isCurrentlyInstalling = false
      broadcast('error')
      return { success: false, error: err?.message || 'Unerwarteter Fehler' }
    }
  })

  // 3. Apply changes (spicetify apply)
  ipcMain.handle('spicetify:apply', async () => {
    const exe = getSpicetifyExe()
    if (!fs.existsSync(exe)) {
      return { success: false, error: 'Spicetify ist nicht installiert' }
    }
    return await runPowerShellScript(`& "${exe}" apply`, getWindows)
  })

  // 4. Restore original Spotify (spicetify restore)
  ipcMain.handle('spicetify:restore', async () => {
    const exe = getSpicetifyExe()
    if (!fs.existsSync(exe)) {
      return { success: false, error: 'Spicetify ist nicht installiert' }
    }
    return await runPowerShellScript(`& "${exe}" restore`, getWindows)
  })

  // 5. Upgrade Spicetify (spicetify upgrade)
  ipcMain.handle('spicetify:upgrade', async () => {
    const exe = getSpicetifyExe()
    if (!fs.existsSync(exe)) {
      return { success: false, error: 'Spicetify ist nicht installiert' }
    }
    return await runPowerShellScript(`& "${exe}" upgrade`, getWindows)
  })

  // 6. Open Spicetify Directory in Explorer
  ipcMain.handle('spicetify:open-folder', async () => {
    const dir = getSpicetifyDir()
    if (fs.existsSync(dir)) {
      await shell.openPath(dir)
      return { success: true }
    }
    return { success: false, error: 'Verzeichnis existiert nicht' }
  })
}
