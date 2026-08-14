import { autoUpdater } from 'electron-updater'
import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'

export function initUpdater(mainWindow: Electron.BrowserWindow) {
  // Allow updating without a code signature (common for open-source / free projects on Windows)
  // Disable if you actually sign the .exe with a real certificate later!
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

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
    // For development, this will error if there is no dev-app-update.yml, that's fine.
    sendStatus('error', err.message || err)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatus('downloading', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus('downloaded', info)
  })


  // --- IPC Handlers from Renderer ---
  
  // Client wants to check for updates manually
  ipcMain.handle('updater:check', () => {
    try {
      autoUpdater.checkForUpdatesAndNotify()
    } catch (e) {
      console.error(e);
    }
  })

  // Client wants to start the download (since autoDownload = false)
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
    } catch (e: any) {
      console.error('Download update error:', e);
      sendStatus('error', e.message || String(e))
    }
  })

  // Client wants to quit and install immediately
  ipcMain.handle('updater:install', () => {
    try {
      autoUpdater.quitAndInstall()
    } catch (e) {
      console.error(e);
    }
  })

  // Check on startup is now handled by the frontend to prevent race conditions
}
