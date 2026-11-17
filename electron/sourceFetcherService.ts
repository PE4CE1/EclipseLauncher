import { app, BrowserWindow, session } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { APP_VERSION } from '../src/services/appVersion'
import { parseHydraSource } from '../src/services/sourceValidation'
import { normalizeSourceUrl, sourceKey } from '../src/services/sourceUrls'
import { isSourceTlsError } from '../src/services/sourceErrors'
import { createConcurrentQueue } from '../src/services/concurrentQueue'
import type { FetchSourceResult, HydraDownload } from '../src/types/source'

export interface CachedSource { url: string; name: string; lastSynced: number; data: HydraDownload[] }
const CACHE_DIR = path.join(app.getPath('userData'), 'sources_cache')
const MAX_SOURCE_BYTES = 80 * 1024 * 1024
const requests = new Map<string, Promise<FetchSourceResult>>()
const downloads = createConcurrentQueue(2), verification = createConcurrentQueue(1)
const fileFor = (url: string) => path.join(CACHE_DIR, crypto.createHash('md5').update(url.trim()).digest('hex') + '.json')
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Source request failed'
class SourcePayloadError extends Error {}
const cancelBody = (response: Response) => { try { void Promise.resolve(response.body?.cancel()).catch(() => {}) } catch {} }

function parseCached(value: unknown): CachedSource | null {
  if (!value || typeof value !== 'object') return null
  const cached = value as CachedSource
  if (typeof cached.url !== 'string' || !Number.isFinite(cached.lastSynced)) return null
  const parsed = parseHydraSource({ name: cached.name, downloads: cached.data })
  return { url: sourceKey(cached.url), name: parsed.name, lastSynced: cached.lastSynced, data: parsed.downloads }
}
export function getCachedSource(rawUrl: string): CachedSource | null {
  try {
    const key = sourceKey(rawUrl)
    for (const file of new Set([fileFor(key), fileFor(rawUrl)])) {
      if (!fs.existsSync(file)) continue
      const cached = parseCached(JSON.parse(fs.readFileSync(file, 'utf8')))
      if (cached?.url === key) return cached
    }
  } catch {}
  return null
}
export function getAllCachedSources(): CachedSource[] {
  if (!fs.existsSync(CACHE_DIR)) return []
  const results = new Map<string, CachedSource>()
  for (const file of fs.readdirSync(CACHE_DIR)) {
    if (!/^[a-f0-9]{32}\.json$/.test(file)) continue
    try {
      const cached = parseCached(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8')))
      if (cached && (!results.has(cached.url) || results.get(cached.url)!.lastSynced < cached.lastSynced)) results.set(cached.url, cached)
    } catch {}
  }
  return [...results.values()]
}
export function saveCachedSource(rawUrl: string, name: string, data: HydraDownload[]): number {
  const url = sourceKey(rawUrl), source = parseHydraSource({ name, downloads: data })
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const lastSynced = Date.now(), file = fileFor(url), temporary = file + '.' + crypto.randomUUID() + '.tmp'
  try { fs.writeFileSync(temporary, JSON.stringify({ url, name: source.name, lastSynced, data: source.downloads }), 'utf8'); fs.renameSync(temporary, file) }
  finally { try { fs.unlinkSync(temporary) } catch {} }
  return lastSynced
}
export function removeCachedSource(rawUrl: string): void {
  for (const file of new Set([fileFor(sourceKey(rawUrl)), fileFor(rawUrl)])) {
    try { fs.unlinkSync(file) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
export function clearCachedSources(): void {
  if (!fs.existsSync(CACHE_DIR)) return
  for (const file of fs.readdirSync(CACHE_DIR)) if (/^[a-f0-9]{32}\.json$/.test(file)) fs.unlinkSync(path.join(CACHE_DIR, file))
}

async function readSourceText(response: Response): Promise<string> {
  if (Number(response.headers?.get?.('content-length') || 0) > MAX_SOURCE_BYTES) { cancelBody(response); throw new SourcePayloadError('Source exceeds the 80 MiB limit') }
  if (!response.body?.getReader) {
    const text = await response.text()
    if (Buffer.byteLength(text) > MAX_SOURCE_BYTES) throw new SourcePayloadError('Source exceeds the 80 MiB limit')
    return text
  }
  const reader = response.body.getReader(), chunks: Buffer[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_SOURCE_BYTES) { await reader.cancel(); throw new SourcePayloadError('Source exceeds the 80 MiB limit') }
      chunks.push(Buffer.from(result.value))
    }
    return Buffer.concat(chunks, size).toString('utf8')
  } finally { reader.releaseLock() }
}
function parseResponse(text: string, url: string) {
  const value = JSON.parse(text.replace(/^\uFEFF/, '').trim())
  const parsed = parseHydraSource(value, new URL(url).pathname.split('/').pop()?.replace(/\.json$/i, '') || 'Source')
  if (value.downloads.length && !parsed.downloads.length) throw new Error('Source contains no usable download links')
  return parsed
}
function freshResult(url: string, parsed: ReturnType<typeof parseResponse>): FetchSourceResult {
  try { return { success: true, name: parsed.name, data: parsed.downloads, lastSynced: saveCachedSource(url, parsed.name, parsed.downloads) } }
  catch { return { success: true, name: parsed.name, data: parsed.downloads, lastSynced: Date.now(), error: 'Source loaded, but its disk cache could not be saved' } }
}
const pause = (delay: number) => new Promise<void>(resolve => setTimeout(resolve, delay))

async function verifySource(url: string): Promise<ReturnType<typeof parseResponse>> {
  return verification.run(() => new Promise((resolve, reject) => {
    const window = new BrowserWindow({ width: 620, height: 650, show: true, title: 'Eclipse — Source verification', autoHideMenuBar: true, webPreferences: { partition: 'persist:hydra_sources', nodeIntegration: false, contextIsolation: true, sandbox: true } })
    let settled = false, checking = false
    let poll: ReturnType<typeof setInterval> | undefined
    const finish = (error?: Error, data?: ReturnType<typeof parseResponse>) => {
      if (settled) return
      settled = true; clearTimeout(timeout); clearInterval(poll)
      if (!window.isDestroyed()) window.destroy()
      if (error) reject(error); else resolve(data!)
    }
    const timeout = setTimeout(() => finish(new Error('Source verification timed out')), 90_000)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, destination) => { try { normalizeSourceUrl(destination) } catch { event.preventDefault() } })
    window.on('closed', () => finish(new Error('Source verification was closed')))
    const inspect = async () => {
      if (settled || checking || window.isDestroyed()) return
      checking = true
      try {
        const text = await window.webContents.executeJavaScript("(document.querySelector('pre')?.textContent || document.body?.innerText || '').slice(0, 83886081)")
        if (settled || typeof text !== 'string' || !text.trimStart().replace(/^\uFEFF/, '').startsWith('{')) return
        if (Buffer.byteLength(text) > MAX_SOURCE_BYTES) { finish(new Error('Source exceeds the 80 MiB limit')); return }
        try { finish(undefined, parseResponse(text, url)) } catch (error) { finish(new Error('Invalid source JSON: ' + errorText(error))) }
      } catch {} finally { checking = false }
    }
    window.webContents.on('did-finish-load', () => { void inspect(); if (!poll && !settled) poll = setInterval(() => { void inspect() }, 1000) })
    void window.loadURL(url).catch(error => finish(new Error('Source verification could not load: ' + errorText(error))))
  }))
}

async function fetchSource(url: string): Promise<FetchSourceResult> {
  const sourceSession = session.fromPartition('persist:hydra_sources')
  const userAgent = sourceSession.getUserAgent?.() || `Eclipse/${APP_VERSION}`
  sourceSession.setUserAgent(userAgent)
  sourceSession.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false))
  sourceSession.setPermissionCheckHandler?.(() => false)
  let failure = 'Source request failed', challenge = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    let timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await sourceSession.fetch(url, { signal: controller.signal, headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.5' } })
      clearTimeout(timer); timer = setTimeout(() => controller.abort(), 60_000)
      if (response.status === 429 || response.status >= 500) {
        failure = 'Source returned HTTP ' + response.status
        cancelBody(response)
        if (attempt === 0) { await pause(600); continue }
        break
      }
      const text = await readSourceText(response)
      challenge = text.replace(/^\uFEFF/, '').trimStart().startsWith('<') && /cf-chl-|challenge-platform|cf-turnstile|Just a moment|cf_clearance/i.test(text.slice(0, 60_000))
      if (challenge) { failure = 'Source requires browser verification'; break }
      if (!response.ok) { failure = 'Source returned HTTP ' + response.status; break }
      try { return freshResult(url, parseResponse(text, url)) }
      catch (error) { failure = 'Invalid source JSON: ' + errorText(error); break }
    } catch (error) {
      if (error instanceof SourcePayloadError) { failure = error.message; break }
      failure = controller.signal.aborted ? 'Source request timed out' : 'Source could not be reached: ' + errorText(error)
      if (isSourceTlsError(errorText(error))) break
      if (attempt === 0 && !controller.signal.aborted) { await pause(400); continue }
      break
    } finally { clearTimeout(timer) }
  }
  if (challenge) {
    try { return freshResult(url, await verifySource(url)) } catch (error) { failure = errorText(error) }
  }
  const cached = getCachedSource(url)
  return cached ? { success: true, name: cached.name, data: cached.data, stale: true, lastSynced: cached.lastSynced, error: failure } : { success: false, error: failure }
}

export function fetchAndCacheSource(rawUrl: string): Promise<FetchSourceResult> {
  let url: string
  try { url = normalizeSourceUrl(typeof rawUrl === 'string' ? rawUrl : '') }
  catch (error) { return Promise.resolve({ success: false, error: errorText(error) }) }
  const existing = requests.get(url)
  if (existing) return existing
  const task = downloads.run(() => fetchSource(url)).catch(error => ({ success: false, error: errorText(error) })).finally(() => requests.delete(url))
  requests.set(url, task)
  return task
}
