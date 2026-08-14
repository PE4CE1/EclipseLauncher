import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import { URL } from 'url'

const defaultDownloadPath = path.join(app.getPath('userData'), 'Downloads')
if (!fs.existsSync(defaultDownloadPath)) {
  fs.mkdirSync(defaultDownloadPath, { recursive: true })
}

import { BrowserWindow, session } from 'electron'

export type HttpDownloadPayload = {
  infoHash: string
  name: string
  progress: number
  downloadSpeed: number
  timeRemaining: number
  downloaded: number
  length: number
  status: 'downloading' | 'paused' | 'extracting' | 'done' | 'error'
}

class HttpDownloader {
  public id: string
  public url: string
  public name: string
  public targetPath: string
  public downloaded: number = 0
  public length: number = 0
  public status: 'downloading' | 'paused' | 'extracting' | 'done' | 'error' = 'downloading'
  public autoExtract: boolean = false
  
  private req: any = null
  private fileStream: fs.WriteStream | null = null
  private lastTime: number = Date.now()
  private lastDownloaded: number = 0
  public downloadSpeed: number = 0

  constructor(url: string, name: string, targetDir: string, autoExtract: boolean) {
    this.url = url
    this.name = name
    this.id = crypto.createHash('md5').update(url).digest('hex')
    this.targetPath = path.join(targetDir, name.replace(/[^a-zA-Z0-9.\-_ ]/g, ''))
    this.autoExtract = autoExtract
  }

  public start(onProgress: (payload: HttpDownloadPayload) => void) {
    this.status = 'downloading'
    this.download()

    const interval = setInterval(() => {
      if (this.status === 'done' || this.status === 'paused') {
        clearInterval(interval)
      }
      
      const now = Date.now()
      const timeDiff = (now - this.lastTime) / 1000
      if (timeDiff > 0) {
        const bytesDiff = this.downloaded - this.lastDownloaded
        this.downloadSpeed = bytesDiff / timeDiff
      }
      this.lastTime = now
      this.lastDownloaded = this.downloaded

      const timeRemaining = this.downloadSpeed > 0 ? (this.length - this.downloaded) / this.downloadSpeed : Infinity
      const progress = this.length > 0 ? this.downloaded / this.length : 0

      onProgress({
        infoHash: this.id,
        name: this.name,
        progress,
        downloadSpeed: this.downloadSpeed,
        timeRemaining,
        downloaded: this.downloaded,
        length: this.length,
        status: this.status
      })
    }, 1000)
  }

  private download() {
    const parsedUrl = new URL(this.url)
    const client = parsedUrl.protocol === 'https:' ? https : http

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }

    this.req = client.get(this.url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
        if (res.headers.location) {
          this.url = res.headers.location
          this.download()
          return
        }
      }

      this.length = parseInt(res.headers['content-length'] || '0', 10)
      this.fileStream = fs.createWriteStream(this.targetPath)
      
      res.on('data', (chunk) => {
        if (this.status === 'paused') {
          res.destroy()
          return
        }
        this.downloaded += chunk.length
        this.fileStream?.write(chunk)
      })

      res.on('end', async () => {
        this.fileStream?.end()
        if (this.status !== 'paused') {
          this.downloadSpeed = 0
          this.downloaded = this.length

          // Check for auto-extract if it's a zip/rar file
          if (this.autoExtract && (this.targetPath.endsWith('.zip') || this.targetPath.endsWith('.rar') || this.targetPath.endsWith('.7z'))) {
            this.status = 'extracting'
            const { extractArchive } = require('./extractService')
            try {
              const targetExtractPath = this.targetPath.substring(0, this.targetPath.lastIndexOf('.'))
              await extractArchive(this.targetPath, targetExtractPath)
              this.status = 'done'
            } catch (e) {
              console.error('Extraction error:', e)
              this.status = 'error'
            }
          } else {
            this.status = 'done'
          }
        }
      })
      
      res.on('error', (err: any) => {
        console.error('HTTP Download Response Error:', err)
        this.status = 'paused'
      })
    })

    this.req.on('error', (err: any) => {
      console.error('HTTP Download Request Error:', err)
      this.status = 'paused'
    })
    
    // Set a timeout to prevent hanging connections
    this.req.setTimeout(15000, () => {
      console.error('HTTP Download Request Timeout')
      this.req.destroy()
      this.status = 'paused'
    })
  }

  public cancel() {
    this.status = 'paused'
    if (this.req) this.req.destroy()
    if (this.fileStream) this.fileStream.close()
  }
}

async function resolveDirectLink(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: true, // Visible so user can solve captchas!
      width: 1000,
      height: 700,
      title: "Warte auf Download-Freigabe (Captcha / Countdown)...",
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    const handleDownload = (event: any, item: any) => {
      event.preventDefault()
      const downloadUrl = item.getURL()
      win.webContents.session.removeListener('will-download', handleDownload)
      win.destroy()
      resolve(downloadUrl)
    }

    win.webContents.session.on('will-download', handleDownload)

    win.webContents.on('did-finish-load', () => {
      win.webContents.executeJavaScript(`
        (function() {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (attempts > 30) {
              clearInterval(interval);
              return;
            }
            
            // PixelDrain
            const pdBtn = document.querySelector('a[href*="/api/file/"]');
            if (pdBtn) {
              pdBtn.click();
              clearInterval(interval);
              return;
            }
            
            // Gofile
            const goBtns = Array.from(document.querySelectorAll('button, a'));
            for (const btn of goBtns) {
              const text = (btn.innerText || '').toLowerCase();
              // Gofile usually has a download icon or text
              if (text.includes('download') || btn.getAttribute('href')?.includes('download')) {
                btn.click();
                clearInterval(interval);
                return;
              }
            }
          }, 1000);
        })();
      `).catch(e => console.error('Scraper injection error:', e))
    })

    win.loadURL(url).catch((err) => {
      if (!win.isDestroyed()) {
        win.destroy()
        reject(err)
      }
    })

    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.webContents.session.removeListener('will-download', handleDownload)
        win.destroy()
        reject(new Error('Link resolution timeout'))
      }
    }, 300000) // 5 Minuten Timeout für Countdown/Captchas
  })
}

const activeDownloads = new Map<string, HttpDownloader>()

export function initHttpDownloadIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  
  ipcMain.handle('http-download:start', async (_event, originalUrl: string, name: string, downloadPath?: string, autoExtract?: boolean) => {
    const targetPath = downloadPath || defaultDownloadPath
    // We use the original URL to generate the infoHash, so it stays consistent
    const downloaderId = crypto.createHash('md5').update(originalUrl).digest('hex')
    
    if (activeDownloads.has(downloaderId)) {
      return { success: true, infoHash: downloaderId }
    }
    
    // Resolve the real direct link via hidden browser
    let directUrl = originalUrl
    try {
      // Send initial progress to show UI that we are extracting
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('torrent:progress', {
          infoHash: downloaderId,
          name: name,
          progress: 0,
          downloadSpeed: 0,
          timeRemaining: Infinity,
          downloaded: 0,
          length: 0,
          status: 'downloading'
        })
      }
      directUrl = await resolveDirectLink(originalUrl)
    } catch (e) {
      console.error('Failed to resolve direct link, falling back to original:', e)
    }

    const downloader = new HttpDownloader(directUrl, name, targetPath, !!autoExtract)
    downloader.id = downloaderId // override to match UI ID
    
    activeDownloads.set(downloader.id, downloader)
    
    downloader.start((payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('torrent:progress', payload)
      }
    })
    
    return { success: true, infoHash: downloader.id }
  })

  ipcMain.handle('http-download:pause', async (_event, infoHash: string) => {
    const d = activeDownloads.get(infoHash)
    if (d) d.cancel()
  })

  ipcMain.handle('http-download:resume', async (_event, infoHash: string) => {
    // Basic HTTP resume is not fully implemented in this simple script (requires Range headers).
    // For now, it will just start over or do nothing.
  })

  ipcMain.handle('http-download:cancel', async (_event, infoHash: string) => {
    const d = activeDownloads.get(infoHash)
    if (d) {
      d.cancel()
      activeDownloads.delete(infoHash)
    }
  })

  ipcMain.handle('link:check', async (_event, url: string) => {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      return res.ok || res.status === 405
    } catch {
      return false
    }
  })
}
