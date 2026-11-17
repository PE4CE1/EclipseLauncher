import { autoUpdater } from 'electron-updater'
import { app } from 'electron'
import { ipcMain } from './ipcSecurity'
import path from 'node:path'
import { hasExternalBroker, spawnExternalApplication, waitForExternalLaunches } from './externalLaunch'

export function isTrustedUpdateUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password &&
      !url.port && /^\/PE4CE1\/EclipseLauncher\/releases\/(?:download\/[^/]+|latest\/download)\/[^/]+\.exe$/i.test(url.pathname)
  } catch { return false }
}


export function initUpdater(mainWindow: Electron.BrowserWindow) {
  // Preserve electron-updater's validated installer path and arguments, while
  // keeping the installer and its restarted app outside the old memory job.
  const nativeUpdater = autoUpdater as typeof autoUpdater & { spawnLog?: (exe: string, args?: string[], env?: NodeJS.ProcessEnv, stdio?: unknown) => Promise<boolean>; memoryBrokerInstalled?: boolean }
  if (!nativeUpdater.memoryBrokerInstalled && nativeUpdater.spawnLog) {
    const spawnLog = nativeUpdater.spawnLog.bind(autoUpdater)
    nativeUpdater.spawnLog = async (exe, args = [], env, stdio) => {
      if (!hasExternalBroker()) return spawnLog(exe, args, env, stdio)
      if (env) throw new Error('Custom installer environments are unsupported while the memory limit is active')
      const child = await spawnExternalApplication(exe, args, path.dirname(exe)); child.unref(); return true
    }
    nativeUpdater.memoryBrokerInstalled = true
  }
  let downloadInProgress = false
  let updateReady = false
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = !hasExternalBroker()
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.disableWebInstaller = true

  const sendStatus = (status: string, data?: unknown) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('updater:status', { status, data })
  }
  const failure = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    sendStatus('error', message)
    return { success: false as const, error: message }
  }
  // The native quit event is too late to await an outside-job IPC handoff.
  // Start it before quitting; the shared shutdown guard waits for its OS ack.
  if (hasExternalBroker()) app.on('before-quit', event => {
    if (!updateReady) return
    event.preventDefault()
    updateReady = false
    const installer = autoUpdater as typeof autoUpdater & { install?: (silent: boolean, runAfter: boolean) => boolean }
    installer.install?.(true, false)
    void waitForExternalLaunches().then(() => app.quit())
  })

  // A download revalidates metadata without replacing the active card with a checking screen.
  autoUpdater.on('checking-for-update', () => { if (!downloadInProgress) sendStatus('checking') })
  autoUpdater.on('update-available', info => { if (!downloadInProgress) sendStatus('available', info) })
  autoUpdater.on('update-not-available', info => { if (!downloadInProgress) sendStatus('not-available', info) })
  autoUpdater.on('error', error => { updateReady = false; sendStatus('error', error?.message || String(error)) })
  autoUpdater.on('download-progress', progress => sendStatus('downloading', progress))
  autoUpdater.on('update-downloaded', info => { updateReady = true; sendStatus('downloaded', info) })

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { success: false, error: 'Automatic updates require an installed or packaged Eclipse build.' }
    try { await autoUpdater.checkForUpdates(); return { success: true } }
    catch (error) { return failure(error) }
  })

  ipcMain.handle('updater:download', async (_event, directUrl?: string) => {
    if (downloadInProgress) return { success: false, error: 'An update download is already running' }
    if (directUrl !== undefined && !isTrustedUpdateUrl(directUrl)) return failure('Untrusted update URL')
    if (!app.isPackaged) return failure('Automatic updates require an installed or packaged Eclipse build.')
    downloadInProgress = true
    updateReady = false
    try {
      // Always use release metadata and its SHA-512 check, even when the renderer supplies an asset URL.
      const result = await autoUpdater.checkForUpdates()
      if (!result?.isUpdateAvailable) throw new Error('No newer update is available.')
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) { return failure(error) }
    finally { downloadInProgress = false }
  })

  ipcMain.handle('updater:install', async () => {
    if (!app.isPackaged || !updateReady || downloadInProgress) return failure('The update must finish downloading before it can be installed.')
    updateReady = false
    try {
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (error) { return failure(error) }
  })
}
