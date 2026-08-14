import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import { URL } from 'url'
import { resolveDownloadLink, resolveHeadlessStream } from './linkResolverService'
import { extractArchive } from './extractService'

function getDefaultDownloadPath(): string {
  try {
    return app.getPath('downloads') || path.join(app.getPath('home'), 'Downloads')
  } catch {
    return path.join(app.getPath('userData'), 'Downloads')
  }
}

export type HttpDownloadPayload = {
  infoHash: string
  name: string
  progress: number
  downloadSpeed: number
  timeRemaining: number
  downloaded: number
  length: number
  status: 'downloading' | 'paused' | 'extracting' | 'done' | 'error'
  mainExe?: string | null
  installPath?: string
  errorMessage?: string
}

class HttpDownloader {
  public id: string
  public url: string
  public name: string
  public targetPath: string
  public targetDir: string
  public downloaded: number = 0
  public length: number = 0
  public status: 'downloading' | 'paused' | 'extracting' | 'done' | 'error' = 'downloading'
  public autoExtract: boolean = true
  public autoDelete: boolean = false
  public mainExe: string | null = null
  public customHeaders: Record<string, string> = {}
  public errorMessage?: string
  
  private req: any = null
  private fileStream: fs.WriteStream | null = null
  private lastTime: number = Date.now()
  private lastDownloaded: number = 0
  public downloadSpeed: number = 0
  private onProgressCallback: ((payload: HttpDownloadPayload) => void) | null = null
  private retryCount: number = 0

  constructor(id: string, url: string, name: string, targetDir: string, autoExtract: boolean, autoDelete: boolean, customHeaders: Record<string, string> = {}) {
    this.id = id
    this.url = url
    this.name = name
    this.targetDir = targetDir
    this.autoExtract = autoExtract
    this.autoDelete = autoDelete
    this.customHeaders = customHeaders

    const cleanName = name.replace(/[^a-zA-Z0-9.\-_ ]/g, '').trim() || 'game_download'
    const ext = url.includes('.rar') ? '.rar' : url.includes('.7z') ? '.7z' : '.zip'
    this.targetPath = path.join(targetDir, `${cleanName}${ext}`)
  }

  public start(onProgress: (payload: HttpDownloadPayload) => void) {
    this.onProgressCallback = onProgress
    this.status = 'downloading'
    this.download()

    const interval = setInterval(() => {
      if (this.status === 'done' || this.status === 'paused' || this.status === 'error') {
        clearInterval(interval)
      }
      
      const now = Date.now()
      const timeDiff = (now - this.lastTime) / 1000
      if (timeDiff > 0) {
        const bytesDiff = this.downloaded - this.lastDownloaded
        this.downloadSpeed = Math.max(0, bytesDiff / timeDiff)
      }
      this.lastTime = now
      this.lastDownloaded = this.downloaded

      const timeRemaining = this.downloadSpeed > 0 && this.length > this.downloaded 
        ? (this.length - this.downloaded) / this.downloadSpeed 
        : Infinity
      const progress = this.length > 0 ? Math.min(1, this.downloaded / this.length) : 0

      onProgress({
        infoHash: this.id,
        name: this.name,
        progress,
        downloadSpeed: this.downloadSpeed,
        timeRemaining,
        downloaded: this.downloaded,
        length: this.length,
        status: this.status,
        mainExe: this.mainExe,
        installPath: this.targetDir,
        errorMessage: this.errorMessage
      })
    }, 1000)
  }

  private download() {
    try {
      const parsedUrl = new URL(this.url)
      const client = parsedUrl.protocol === 'https:' ? https : http

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive',
        ...this.customHeaders
      }

      // Check existing partial file for Resume support
      if (fs.existsSync(this.targetPath)) {
        const stats = fs.statSync(this.targetPath)
        if (stats.size > 0) {
          this.downloaded = stats.size
          headers['Range'] = `bytes=${stats.size}-`
        }
      }

      this.req = client.get(this.url, { headers }, async (res) => {
        // Handle 3xx Redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
          if (res.headers.location) {
            let nextUrl = res.headers.location
            if (!nextUrl.startsWith('http')) {
              nextUrl = new URL(nextUrl, this.url).toString()
            }
            this.url = nextUrl
            this.download()
            return
          }
        }

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
          console.error(`[HttpDownloader] Server responded with HTTP status ${res.statusCode}`)
          this.status = 'error'
          this.errorMessage = `HTTP Fehler ${res.statusCode}`
          return
        }

        const contentType = (res.headers['content-type'] || '').toLowerCase()
        let totalContentLength = parseInt(res.headers['content-length'] || '0', 10)
        
        if (!totalContentLength && res.headers['content-range']) {
          const rangeMatch = String(res.headers['content-range']).match(/\/(\d+)/)
          if (rangeMatch) {
            totalContentLength = parseInt(rangeMatch[1], 10)
          }
        }

        // Validation: If server returned HTML page under 500KB, it's not the game binary!
        if (contentType.includes('text/html') && totalContentLength > 0 && totalContentLength < 500000 && this.retryCount === 0) {
          console.warn(`[HttpDownloader] Server returned HTML page (${totalContentLength} bytes) instead of binary. Trying headless sniffer...`)
          this.retryCount++
          const headless = await resolveHeadlessStream(this.url, 12000)
          if (headless && headless.streamUrl) {
            this.url = headless.streamUrl
            if (headless.headers) this.customHeaders = { ...this.customHeaders, ...headless.headers }
            this.download()
            return
          } else {
            console.error('[HttpDownloader] Could not resolve binary stream from landing page')
            this.status = 'error'
            this.errorMessage = 'Dieser Hoster erfordert ein Debrid-Konto oder den Browser-Download'
            return
          }
        }

        if (res.statusCode === 206) {
          this.length = totalContentLength > 0 ? this.downloaded + totalContentLength : this.length
          this.fileStream = fs.createWriteStream(this.targetPath, { flags: 'a' })
        } else {
          this.length = totalContentLength
          this.downloaded = 0
          this.fileStream = fs.createWriteStream(this.targetPath)
        }

        res.on('data', (chunk) => {
          if (this.status === 'paused') {
            res.destroy()
            return
          }
          this.downloaded += chunk.length
          if (this.length > 0 && this.downloaded > this.length) {
            this.length = this.downloaded
          }
          this.fileStream?.write(chunk)
        })

        res.on('end', async () => {
          this.fileStream?.end()
          if (this.status === 'paused') return

          this.downloadSpeed = 0
          this.downloaded = this.length

          // Auto-Extract Phase
          if (this.autoExtract && (this.targetPath.endsWith('.zip') || this.targetPath.endsWith('.rar') || this.targetPath.endsWith('.7z'))) {
            this.status = 'extracting'
            if (this.onProgressCallback) {
              this.onProgressCallback({
                infoHash: this.id,
                name: this.name,
                progress: 1,
                downloadSpeed: 0,
                timeRemaining: 0,
                downloaded: this.length,
                length: this.length,
                status: 'extracting',
                installPath: this.targetDir
              })
            }

            try {
              const cleanGameDir = path.join(this.targetDir, this.name.replace(/[^a-zA-Z0-9.\-_ ]/g, '').trim())
              const result = await extractArchive(
                this.targetPath, 
                cleanGameDir, 
                (extractPercent) => {
                  if (this.onProgressCallback) {
                    this.onProgressCallback({
                      infoHash: this.id,
                      name: this.name,
                      progress: extractPercent / 100,
                      downloadSpeed: 0,
                      timeRemaining: 0,
                      downloaded: this.length,
                      length: this.length,
                      status: 'extracting',
                      installPath: cleanGameDir
                    })
                  }
                },
                this.autoDelete
              )

              this.mainExe = result.mainExe
              this.status = 'done'
              console.log(`[HttpDownloader] Finished & extracted game to: ${result.targetDir}, Main Exe: ${result.mainExe}`)
            } catch (extractErr) {
              console.error('[HttpDownloader] Extraction error:', extractErr)
              this.status = 'done'
            }
          } else {
            this.status = 'done'
          }

          if (this.onProgressCallback) {
            this.onProgressCallback({
              infoHash: this.id,
              name: this.name,
              progress: 1,
              downloadSpeed: 0,
              timeRemaining: 0,
              downloaded: this.length,
              length: this.length,
              status: this.status,
              mainExe: this.mainExe,
              installPath: this.targetDir
            })
          }
        })

        res.on('error', (err: any) => {
          console.error('[HttpDownloader] Response error:', err)
          if (this.retryCount < 3 && this.status !== 'paused') {
            this.retryCount++
            console.log(`[HttpDownloader] Auto-resuming download after socket drop (retry ${this.retryCount}/3)...`)
            setTimeout(() => this.download(), 1500)
            return
          }
          this.status = 'error'
          this.errorMessage = err.message
        })
      })

      this.req.on('error', (err: any) => {
        console.error('[HttpDownloader] Request error:', err)
        this.status = 'error'
        this.errorMessage = err.message
      })

      this.req.setTimeout(35000, () => {
        console.warn('[HttpDownloader] Connection timeout')
        this.req.destroy()
        this.status = 'paused'
      })
    } catch (e: any) {
      console.error('[HttpDownloader] Unexpected download error:', e)
      this.status = 'error'
      this.errorMessage = e.message
    }
  }

  public pause() {
    this.status = 'paused'
    if (this.req) this.req.destroy()
    if (this.fileStream) this.fileStream.close()
  }

  public resume() {
    if (this.status === 'paused') {
      this.status = 'downloading'
      this.download()
    }
  }

  public cancel() {
    this.status = 'paused'
    if (this.req) this.req.destroy()
    if (this.fileStream) {
      this.fileStream.close()
    }
    try {
      if (fs.existsSync(this.targetPath)) {
        fs.unlinkSync(this.targetPath)
      }
    } catch (e) {}
  }
}

const activeHttpDownloads = new Map<string, HttpDownloader>()

export function initHttpDownloadIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  
  // Return default downloads directory
  ipcMain.handle('app:get-default-download-path', () => {
    return getDefaultDownloadPath()
  })

  // Smart Native Start Download
  ipcMain.handle('http-download:start', async (_event, rawUrl: string, gameTitle: string, customDownloadPath?: string, autoExtract = true, autoDelete = false) => {
    const targetDir = customDownloadPath || getDefaultDownloadPath()
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const downloadId = crypto.createHash('md5').update(rawUrl).digest('hex')

    if (activeHttpDownloads.has(downloadId)) {
      return { success: true, infoHash: downloadId }
    }

    console.log(`[HttpDownload] Resolving link for "${gameTitle}": ${rawUrl}`)
    const resolved = await resolveDownloadLink(rawUrl, gameTitle)

    const downloader = new HttpDownloader(
      downloadId,
      resolved.streamUrl,
      gameTitle,
      targetDir,
      autoExtract,
      autoDelete,
      resolved.headers || {}
    )

    activeHttpDownloads.set(downloadId, downloader)

    downloader.start((payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('torrent:progress', payload)
      }
    })

    return { success: true, infoHash: downloadId, provider: resolved.provider }
  })

  ipcMain.handle('http-download:pause', async (_event, infoHash: string) => {
    const d = activeHttpDownloads.get(infoHash)
    if (d) d.pause()
  })

  ipcMain.handle('http-download:resume', async (_event, infoHash: string) => {
    const d = activeHttpDownloads.get(infoHash)
    if (d) d.resume()
  })

  ipcMain.handle('http-download:cancel', async (_event, infoHash: string) => {
    const d = activeHttpDownloads.get(infoHash)
    if (d) {
      d.cancel()
      activeHttpDownloads.delete(infoHash)
    }
  })

  ipcMain.handle('link:check', async (_event, url: string) => {
    try {
      if (url.startsWith('magnet:')) return true
      if (url.includes('pixeldrain.com') || url.includes('gofile.io') || url.includes('buzzheavier.com')) return true
      const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } })
      return res.ok || res.status === 405 || res.status === 403
    } catch {
      return true
    }
  })
}
