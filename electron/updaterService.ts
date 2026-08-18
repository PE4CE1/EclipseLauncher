import { autoUpdater } from 'electron-updater'
import { ipcMain, app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { execFile } from 'child_process'

let downloadedInstallerPath: string | null = null

export function initUpdater(mainWindow: Electron.BrowserWindow) {
  // Allow updating without a code signature
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Let the renderer know the current state
  const sendStatus = (status: string, data?: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', { status, data })
    }
  }

  // --- AutoUpdater Events ---
  autoUpdater.on('checking-for-update', () => {
    sendStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus('available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    sendStatus('not-available', info)
  })

  autoUpdater.on('error', (err) => {
    sendStatus('error', err?.message || String(err))
  })

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatus('downloading', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus('downloaded', info)
  })

  // Helper to download installer file with live progress and automatic redirect handling
  function downloadFileWithProgress(url: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const get = (currentUrl: string, maxRedirects = 5) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'))

        const client = currentUrl.startsWith('https') ? https : http
        client.get(currentUrl, { headers: { 'User-Agent': 'EclipseLauncher' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location, maxRedirects - 1)
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed with HTTP ${res.statusCode}`))
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let receivedBytes = 0

          const fileStream = fs.createWriteStream(targetPath)
          res.on('data', (chunk) => {
            receivedBytes += chunk.length
            if (totalBytes > 0) {
              const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
              sendStatus('downloading', { percent, total: totalBytes, transferred: receivedBytes })
            }
          })

          res.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()
            resolve()
          })

          fileStream.on('error', (err) => {
            fs.unlink(targetPath, () => {})
            reject(err)
          })
        }).on('error', reject)
      }

      get(url)
    })
  }

  // --- IPC Handlers from Renderer ---

  // Client wants to check for updates manually
  ipcMain.handle('updater:check', () => {
    try {
      if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify()
      }
    } catch (e) {
      console.error('[Updater] Check error:', e)
    }
  })

  // Client wants to start the download
  ipcMain.handle('updater:download', async (_event, directUrl?: string) => {
    try {
      if (app.isPackaged && !directUrl) {
        try {
          await autoUpdater.downloadUpdate()
          return { success: true }
        } catch (err) {
          console.warn('[Updater] autoUpdater.downloadUpdate failed, falling back to direct download:', err)
        }
      }

      // Direct / Dev fallback download
      const targetUrl = directUrl || 'https://github.com/PE4CE1/EclipseLauncher/releases/latest/download/Eclipse.Launcher.Setup.exe'
      const tempPath = path.join(app.getPath('temp'), 'EclipseLauncherSetup.exe')

      sendStatus('downloading', { percent: 2 })
      await downloadFileWithProgress(targetUrl, tempPath)
      downloadedInstallerPath = tempPath
      sendStatus('downloaded', { filePath: tempPath })
      return { success: true, filePath: tempPath }
    } catch (e: any) {
      console.error('[Updater] Download update error:', e)
      sendStatus('error', e.message || String(e))
      return { success: false, error: e.message }
    }
  })

  // Client wants to quit and install immediately
  ipcMain.handle('updater:install', () => {
    try {
      if (downloadedInstallerPath && fs.existsSync(downloadedInstallerPath)) {
        const installer = downloadedInstallerPath
        downloadedInstallerPath = null
        shell.openPath(installer)
        setTimeout(() => app.quit(), 1000)
        return
      }

      if (app.isPackaged) {
        autoUpdater.quitAndInstall()
      } else {
        app.relaunch()
        app.quit()
      }
    } catch (e) {
      console.error('[Updater] Install error:', e)
    }
  })
}
