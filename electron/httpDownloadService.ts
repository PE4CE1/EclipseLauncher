import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { downloadCandidates, prepareDownloadMirror } from './downloadMirrors'
import { extractArchive } from './extractService'
import { downloadUrl, safeDownloadName } from './downloadPaths'
import { downloadIssue, DownloadResolverError } from './downloadErrors'
import type { DownloadIssue, DownloadIssueCode } from '../src/types/downloads'
import { inspectDownloadLink } from './downloadLinkStatus'
import { requestDownloadStream, type DownloadRequest, type DownloadStream } from './downloadTransport'

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
  resolution?: { attempt: number; total: number; host: string }
  mirrorFailures?: DownloadIssue[]
  errorCode?: DownloadIssueCode
}

class DownloadResponseError extends Error {}

export class HttpDownloader {
  public targetPath: string
  public downloaded = 0
  public length = 0
  public status: HttpDownloadPayload['status'] = 'downloading'
  public mainExe: string | null = null
  public errorMessage?: string
  public errorCode?: DownloadIssueCode
  public downloadSpeed = 0

  private req: DownloadRequest | null = null
  private response: DownloadStream | null = null
  private fileStream: fs.WriteStream | null = null
  private fileClosed: Promise<void> = Promise.resolve()
  private interval: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private generation = 0
  private lastTime = Date.now()
  private lastDownloaded = 0
  private onProgressCallback: ((payload: HttpDownloadPayload) => void) | null = null
  private retries = 0
  private extractionAbort: AbortController | null = null
  private installPath: string

  constructor(
    public id: string,
    public url: string,
    public name: string,
    public targetDir: string,
    public autoExtract: boolean,
    public autoDelete: boolean,
    public customHeaders: Record<string, string> = {},
    fileName?: string,
    private partition?: string
  ) {
    const pathname = (fileName || downloadUrl(url).pathname).toLowerCase()
    const ext = /\.(zip|rar|7z|exe|msi|iso|bin)$/.exec(pathname)?.[1] || 'zip'
    this.targetPath = path.join(targetDir, `${safeDownloadName(name)}-${id.slice(0, 8)}.${ext}`)
    this.installPath = targetDir
  }

  private emit(progress?: number) {
    this.onProgressCallback?.({
      infoHash: this.id,
      name: this.name,
      progress: progress ?? (this.length > 0 ? Math.min(1, this.downloaded / this.length) : 0),
      downloadSpeed: this.downloadSpeed,
      timeRemaining: this.downloadSpeed > 0 ? Math.max(0, this.length - this.downloaded) / this.downloadSpeed * 1000 : Infinity,
      downloaded: this.downloaded,
      length: this.length,
      status: this.status,
      mainExe: this.mainExe,
      installPath: this.installPath,
      errorMessage: this.errorMessage,
      errorCode: this.errorCode,
      resolution: undefined,
    })
  }

  private clearTimers() {
    if (this.interval) clearInterval(this.interval)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.interval = null
    this.retryTimer = null
  }

  public start(onProgress: (payload: HttpDownloadPayload) => void) {
    this.onProgressCallback = onProgress
    this.begin()
  }

  private begin() {
    this.clearTimers()
    this.status = 'downloading'
    this.errorMessage = undefined
    this.errorCode = undefined
    this.lastTime = Date.now()
    this.lastDownloaded = this.downloaded
    const generation = ++this.generation
    this.interval = setInterval(() => {
      const now = Date.now()
      const elapsed = (now - this.lastTime) / 1000
      this.downloadSpeed = this.status === 'downloading' && elapsed > 0
        ? Math.max(0, (this.downloaded - this.lastDownloaded) / elapsed) : 0
      this.lastTime = now
      this.lastDownloaded = this.downloaded
      this.emit()
    }, 1000)
    this.emit()
    void this.download(generation)
  }

  private async download(generation: number) {
    try {
      // A destroyed stream can still have an outstanding disk write. Wait for
      // close before inspecting the partial file or opening it for append.
      await this.fileClosed
      if (generation !== this.generation) return
      let redirects = 0
      while (generation === this.generation) {
        const currentUrl = downloadUrl(this.url)
        const offset = (await fs.promises.stat(this.targetPath).catch(() => null))?.size || 0
        if (generation !== this.generation) return
        this.downloaded = offset
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0', Accept: '*/*', ...this.customHeaders,
        }
        for (const key of Object.keys(headers)) {
          if (/^(range|accept-encoding)$/i.test(key)) delete headers[key]
        }
        headers['Accept-Encoding'] = 'identity'
        if (offset > 0) headers.Range = `bytes=${offset}-`

        const response = await new Promise<DownloadStream>((resolve, reject) => {
          const req = requestDownloadStream(currentUrl, headers, resolve, this.partition)
          this.req = req
          req.on('error', reject)
          req.setTimeout(35000, () => req.destroy(new Error('Download connection timed out')))
        })
        this.response = response
        // Redirect/landing-page bodies are drained without a pipeline. Their
        // socket errors must still be consumed while resolution continues.
        response.on('error', () => {})
        if (generation !== this.generation) { response.destroy(); return }
        const status = response.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.resume()
          if (!response.headers.location || ++redirects > 10) throw new DownloadResponseError('Invalid or excessive download redirects')
          const next = downloadUrl(new URL(response.headers.location, currentUrl).href)
          if (next.origin !== currentUrl.origin) {
            for (const key of Object.keys(this.customHeaders)) {
              if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) delete this.customHeaders[key]
            }
          }
          this.url = next.href
          continue
        }
        if (status === 416 && offset > 0 && Number(/^bytes \*\/(\d+)$/.exec(String(response.headers['content-range']))?.[1]) === offset) {
          response.resume()
          this.length = offset
          await this.finishFile(generation)
          return
        }
        if (status < 200 || status >= 300) {
          response.resume()
          throw new DownloadResolverError([404,410].includes(status) ? 'unavailable' : status === 429 ? 'rate-limit' : [401,403].includes(status) ? 'forbidden' : 'network', `Download returned HTTP ${status}`, status)
        }
        if (/html|json|image\//i.test(String(response.headers['content-type']))) {
          response.resume()
          throw new DownloadResponseError('Mirror returned a webpage instead of a download file')
        }

        const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(String(response.headers['content-range'] || ''))
        const contentLength = Number(response.headers['content-length']) || 0
        if (status === 206 && (!range || Number(range[1]) !== offset || Number(range[2]) < offset ||
            (range[3] !== '*' && Number(range[2]) >= Number(range[3])) ||
            (contentLength > 0 && contentLength !== Number(range[2]) - offset + 1))) {
          response.resume()
          throw new DownloadResponseError('Server returned an invalid partial download range')
        }
        if (status === 206) {
          this.length = range![3] !== '*' ? Number(range![3]) : offset + contentLength
        } else {
          this.downloaded = 0
          this.lastDownloaded = 0
          this.length = contentLength
        }
        const disk = typeof fs.promises.statfs === 'function' ? await fs.promises.statfs(this.targetDir).catch(() => null) : null
        if (generation !== this.generation) { response.destroy(); return }
        if (disk && this.length > 0 && disk.bavail * disk.bsize < Math.max(0, this.length - offset)) {
          throw new DownloadResolverError('storage', 'Not enough free space on the destination drive')
        }
        this.fileStream = fs.createWriteStream(this.targetPath, { flags: status === 206 ? 'a' : 'w' })
        this.fileClosed = new Promise(resolve => this.fileStream!.once('close', resolve))
        const counter = new Transform({
          transform: (chunk, _encoding, callback) => {
            this.req?.touch?.()
            if (this.downloaded === 0 && /^\s*(?:<!doctype\s+html|<html\b|<\?xml)/i.test(chunk.subarray(0, 256).toString('utf8'))) {
              callback(new DownloadResponseError('Mirror returned a webpage instead of a download file'))
              return
            }
            this.downloaded += chunk.length
            callback(null, chunk)
          },
        })
        // pipeline applies disk backpressure, forwards disk/socket failures and
        // resolves only after all file writes have finished.
        await pipeline(response, counter, this.fileStream)
        if (generation !== this.generation) return
        if (this.downloaded === 0) throw new DownloadResolverError('no-file', 'Download server returned an empty file')
        if (this.length > 0 && this.downloaded !== this.length) throw new Error('Download ended before the complete file was received')
        this.length = this.downloaded
        await this.finishFile(generation)
        return
      }
    } catch (error) {
      if (generation !== this.generation) return
      this.response?.destroy()
      this.fileStream?.destroy()
      const errorCode = (error as NodeJS.ErrnoException)?.code
      const canRetry = errorCode
        ? ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ERR_STREAM_PREMATURE_CLOSE'].includes(errorCode)
        : /complete file|timed out|net::ERR_(?:CONNECTION_(?:RESET|CLOSED|ABORTED)|NETWORK_CHANGED|TIMED_OUT|NAME_NOT_RESOLVED|CONTENT_LENGTH_MISMATCH|INCOMPLETE_CHUNKED_ENCODING)/i.test(error instanceof Error ? error.message : '')
      if (!(error instanceof DownloadResponseError) && canRetry && this.retries++ < 3 && this.status === 'downloading') {
        this.retryTimer = setTimeout(() => { void this.download(generation) }, 1500)
        return
      }
      this.clearTimers()
      this.status = 'error'
      this.downloadSpeed = 0
      this.errorMessage = error instanceof Error ? error.message : String(error)
      this.errorCode = downloadIssue(error).code
      this.emit()
    }
  }

  private async finishFile(generation: number) {
    this.downloadSpeed = 0
    if (this.autoExtract && /\.(zip|rar|7z)$/i.test(this.targetPath)) {
      this.status = 'extracting'
      this.installPath = path.join(this.targetDir, safeDownloadName(this.name))
      this.emit(0)
      this.extractionAbort = new AbortController()
      try {
        const result = await extractArchive(this.targetPath, this.installPath, percent => {
          if (generation === this.generation) this.emit(percent / 100)
        }, this.autoDelete, this.extractionAbort.signal)
        if (generation !== this.generation) return
        this.mainExe = result.mainExe
        this.installPath = result.targetDir
      } catch (error) {
        throw new DownloadResponseError(`Entpacken fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.status = 'done'
    this.clearTimers()
    this.emit(1)
  }

  public pause() {
    if (this.status !== 'downloading') return
    this.stop()
    this.emit()
  }

  public stop() {
    ++this.generation
    this.clearTimers()
    this.status = 'paused'
    this.downloadSpeed = 0
    this.req?.destroy()
    this.response?.destroy()
    this.fileStream?.destroy()
    this.extractionAbort?.abort()
  }

  public resume() {
    if (this.status !== 'paused' && this.status !== 'error') return
    this.retries = 0
    this.begin()
  }

  public async cancel() {
    this.stop()
    await this.fileClosed
    await fs.promises.unlink(this.targetPath).catch(() => {})
  }
}

const activeHttpDownloads = new Map<string, HttpDownloader>()
type HttpDownloadJob = {
  paused: boolean; failed: boolean; resolving: boolean; version: number; controller: AbortController; cursor: number; failures: DownloadIssue[]; last: HttpDownloadPayload; run: () => Promise<void>
}
const pendingResolutions = new Map<string, HttpDownloadJob>()
export const hasHttpDownloadWork = () => activeHttpDownloads.size > 0 || pendingResolutions.size > 0

export function stopHttpDownloads() {
  for (const job of pendingResolutions.values()) job.controller.abort()
  pendingResolutions.clear()
  for (const downloader of activeHttpDownloads.values()) downloader.stop()
  activeHttpDownloads.clear()
}

export function initHttpDownloadIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  const sendProgress = (payload: HttpDownloadPayload) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('torrent:progress', payload)
  }
  ipcMain.handle('app:get-default-download-path', () => getDefaultDownloadPath())
  ipcMain.handle('http-download:start', async (_event, rawUrl: string, gameTitle: string, customDownloadPath?: string, autoExtract = true, autoDelete = false, mirrors: unknown = []) => {
    try {
      const candidates = downloadCandidates(rawUrl, mirrors)
      const targetDir = customDownloadPath || getDefaultDownloadPath()
      if (!path.isAbsolute(targetDir)) throw new Error('Download destination must be an absolute path')
      await fs.promises.mkdir(targetDir, { recursive: true })
      const downloadId = crypto.createHash('md5').update(rawUrl).digest('hex')
      const previousJob = pendingResolutions.get(downloadId)
      if (previousJob?.failed && !activeHttpDownloads.has(downloadId)) {
        previousJob.controller.abort()
        pendingResolutions.delete(downloadId)
      }
      if (activeHttpDownloads.has(downloadId) || pendingResolutions.has(downloadId)) return { success: true, infoHash: downloadId }
      const initial: HttpDownloadPayload = { infoHash: downloadId, name: gameTitle, progress: 0, downloadSpeed: 0, timeRemaining: Infinity, downloaded: 0, length: 0, status: 'downloading', installPath: targetDir }
      const job: HttpDownloadJob = { paused: false, failed: false, resolving: false, version: 0, controller: new AbortController(), cursor: 0, failures: [], last: initial, run: async () => {} }
      pendingResolutions.set(downloadId, job)
      const progress = (payload: HttpDownloadPayload) => { job.last = payload; sendProgress(payload) }
      job.run = async () => {
        const version = ++job.version, controller = job.controller
        const live = () => pendingResolutions.get(downloadId) === job && job.version === version && !controller.signal.aborted
        job.resolving = true
        while (job.cursor < candidates.length && live() && !job.paused) {
          const url = candidates[job.cursor++], host = new URL(url).hostname
          progress({ ...initial, mirrorFailures: [...job.failures], status: job.paused ? 'paused' : 'downloading', resolution: { attempt: job.cursor, total: candidates.length, host } })
          try {
            const resolved = await prepareDownloadMirror(url, gameTitle, controller.signal)
            if (!live()) return
            job.resolving = false
            const downloader = new HttpDownloader(downloadId, resolved.streamUrl, gameTitle, targetDir, autoExtract, autoDelete, resolved.headers || {}, resolved.fileName, resolved.partition)
            activeHttpDownloads.set(downloadId, downloader)
            downloader.start(payload => {
              if (!live()) return
              if (payload.status === 'error') job.failures.push({ host, url, code: payload.errorCode || 'unknown' })
              if (payload.status === 'error' && payload.downloaded === 0 && !['storage', 'permission'].includes(payload.errorCode || '')) {
                activeHttpDownloads.delete(downloadId)
                // Wait for the empty file to close before another mirror reuses
                // this destination. Never splice two mirrors into a partial file.
                void downloader.cancel().then(() => {
                  if (!live()) return
                  if (job.cursor < candidates.length) return job.run()
                  job.failed = true
                  progress({ ...payload, mirrorFailures: [...job.failures] })
                })
                return
              }
              progress({ ...payload, mirrorFailures: [...job.failures] })
              if (payload.status === 'done') { pendingResolutions.delete(downloadId); activeHttpDownloads.delete(downloadId) }
            })
            if (job.paused) downloader.pause()
            return
          } catch (error) {
            if (!live()) return
            job.failures.push(downloadIssue(error, url))
          }
        }
        if (live() && !job.paused) {
          job.resolving = false
          job.failed = true
          progress({ ...initial, status: 'error', resolution: undefined, errorMessage: 'No automatic mirror was available.', errorCode: 'no-file', mirrorFailures: [...job.failures] })
        }
      }
      sendProgress(initial)
      void job.run()
      return { success: true, infoHash: downloadId, resolving: true }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) } }
  })
  ipcMain.handle('http-download:pause', (_event, id: string) => {
    const job = pendingResolutions.get(id), downloader = activeHttpDownloads.get(id)
    if (!job && !downloader) return { handled: false }
    if (downloader?.status === 'extracting') return { handled: true, success: false, error: 'Extraction cannot be paused' }
    if (job && !job.paused) {
      job.paused = true
      if (!downloader && !job.failed) {
        if (job.resolving) job.cursor = Math.max(0, job.cursor - 1)
        job.resolving = false; ++job.version; job.controller.abort()
        job.last = { ...job.last, status: 'paused', downloadSpeed: 0, timeRemaining: Infinity }
        sendProgress(job.last)
      }
    }
    downloader?.pause()
    return { handled: true, success: true }
  })
  ipcMain.handle('http-download:resume', (_event, id: string) => {
    const job = pendingResolutions.get(id), downloader = activeHttpDownloads.get(id)
    if (!job && !downloader) return { handled: false }
    if (job && (job.paused || job.failed)) {
      job.paused = false
      if (!downloader) {
        if (job.failed) { job.failed = false; job.cursor = 0; job.failures = [] }
        job.controller = new AbortController()
        void job.run()
      }
    }
    downloader?.resume()
    return { handled: true, success: true }
  })
  ipcMain.handle('http-download:cancel', async (_event, id: string) => {
    const job = pendingResolutions.get(id), downloader = activeHttpDownloads.get(id)
    if (!job && !downloader) return { handled: false }
    job?.controller.abort()
    pendingResolutions.delete(id); activeHttpDownloads.delete(id)
    await downloader?.cancel()
    return { handled: true, success: true }
  })
  ipcMain.handle('link:check', async (_event, rawUrl: string) => {
    try {
      if (rawUrl.startsWith('magnet:')) return true
      const url = downloadUrl(rawUrl)
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      return response.ok || [405, 403].includes(response.status)
    } catch { return false }
  })
  ipcMain.handle('link:inspect', (_event, rawUrl: string) => inspectDownloadLink(rawUrl))
}
