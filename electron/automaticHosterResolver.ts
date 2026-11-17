import { BrowserWindow, session, type Session } from 'electron'
import crypto from 'node:crypto'
import { downloadUrl } from './downloadPaths'
import { requestHosterPage } from './hosterRequest'
import type { DownloadIssueCode } from '../src/types/downloads'

export interface AutomaticHosterDownload { streamUrl: string; headers?: Record<string, string>; fileName?: string; partition?: string }
export interface HosterResolverOptions { signal?: AbortSignal; timeoutMs?: number; partition?: string; onFailure?: (code: DownloadIssueCode, status?: number) => void }
const MAX_PAGE = 2 * 1024 * 1024
const ARCHIVE = /\.(zip|rar|7z|iso|bin|\d{3})(?:$|[?#])/i
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '144.0.0.0'} Safari/537.36`
const decode = (value: string) => value.replace(/&(?:amp|quot|apos|lt|gt|#39|#34);/g, entity => ({ '&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&#34;':'"','&lt;':'<','&gt;':'>' }[entity]!))
function attributes(value: string) {
  const result: Record<string, string> = {}
  for (const match of value.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '')
  return result
}
const literal = (value: string | undefined) => {
  if (!value) return ''
  if (value.startsWith('"')) { try { return String(JSON.parse(value)) } catch { return '' } }
  return value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : value
}

type HosterPage =
  | { kind: 'blocked' }
  | { kind: 'unknown' }
  | { kind: 'direct'; url: string }
  | { kind: 'request'; url: string }
  | { kind: 'form'; url: string; fields: URLSearchParams; wait: number; fileName?: string }

/** Read only ordinary public download forms. Captcha/password/premium gates stay gates. */
export function parseHosterPage(html: string, url: string): HosterPage {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const component = /<download-countdown\b([^>]*)>/i.exec(clean)
  if (component) {
    const values = attributes(component[1]), get = (key: string) => literal(values[':' + key] ?? values[key])
    const flag = (key: string) => key in values || ':' + key in values ? !['false', '0'].includes(get(key).toLowerCase()) : false
    if (flag('has-captcha') || flag('has-password') || flag('size-gated')) return { kind: 'blocked' }
    const id = get('code')
    if (id && /^[a-z0-9_-]+$/i.test(id)) {
      const fields = new URLSearchParams({ op: 'download2', id, rand: get('rand'), referer: get('referer'), method_free: get('free-method'), method_premium: '', g_captch__a: '1' })
      if (get('dl-token')) fields.set('dl_token', get('dl-token'))
      const countdown = Number(get('countdown'))
      if (flag('has-countdown') && (!Number.isFinite(countdown) || countdown < 0 || countdown > 45)) return { kind: 'blocked' }
      return { kind: 'form', url, fields, wait: flag('has-countdown') ? countdown : 0, fileName: get('name') || undefined }
    }
  }
  if (/class\s*=\s*["'][^"']*(?:cf-turnstile|g-recaptcha|h-captcha)/i.test(clean) || /<title[^>]*>\s*Just a moment/i.test(clean)) return { kind: 'blocked' }
  // Follow only the download action published on the page. In particular,
  // Buzzheavier's HTMX flow must not be replaced by a guessed /id/download URL.
  for (const match of clean.matchAll(/<(?:a|button)\b([^>]*)>([^<]*)/gi)) {
    const a = attributes(match[1])
    if (!a['hx-get'] || 'disabled' in a || a['hx-vals'] || a['hx-include']) continue
    if (!/download/i.test(a.id || '') && !/^\s*(?:free download|download(?: file)?)\s*$/i.test(match[2])) continue
    try {
      const target = downloadUrl(new URL(a['hx-get'], url).href)
      if (target.origin === new URL(url).origin) return { kind: 'request', url: target.href }
    } catch {}
  }
  for (const match of clean.matchAll(/<a\b([^>]*)>/gi)) {
    const a = attributes(match[1])
    if (/^(?:download-link|direct_link|downloadbtn|download-btn|downloadButton)$/i.test(a.id || '') && a.href) {
      try { return { kind: 'direct', url: downloadUrl(new URL(a.href, url).href).href } } catch {}
    }
  }
  for (const match of clean.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const form = attributes(match[1]), fields = new URLSearchParams()
    for (const input of match[2].matchAll(/<(?:input|button)\b([^>]*)>/gi)) {
      const a = attributes(input[1])
      if (a.name && (a.type === 'hidden' || a.name === 'method_free')) fields.set(a.name, a.value || '')
    }
    if (!/^download[12]$/.test(fields.get('op') || '') || !fields.get('id')) continue
    if (/<input\b[^>]*type\s*=\s*["']?password/i.test(match[2])) return { kind: 'blocked' }
    if (!fields.has('method_free')) fields.set('method_free', '')
    const action = downloadUrl(new URL(form.action || url, url).href)
    if (action.origin !== new URL(url).origin) continue
    return { kind: 'form', url: action.href, fields, wait: 0 }
  }
  return { kind: 'unknown' }
}

export function isArchiveResponse(url: string, type = '', disposition = '') {
  const filename = /filename\*?\s*=\s*(?:UTF-8''|["'])?([^"';]+)/i.exec(disposition)?.[1] || ''
  if (/html|json|image\//i.test(type) || /\.(?:exe|msi)(?:$|[?#])/i.test(url) || /\.(?:exe|msi)$/i.test(filename)) return false
  return /application\/(?:zip|x-zip|x-rar|vnd.rar|x-7z)/i.test(type) || ARCHIVE.test(url) || /attachment/i.test(disposition) && ARCHIVE.test(filename)
}
async function cookiesFor(ses: Session, url: string, referer: string) {
  const cookies = await ses.cookies.get({ url }).catch(() => [])
  return { 'User-Agent': USER_AGENT, Referer: referer, ...(cookies.length ? { Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') } : {}) }
}
async function pageText(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return (await response.text()).slice(0, MAX_PAGE)
  let size = 0
  const chunks: Buffer[] = []
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_PAGE) { await reader.cancel(); throw new Error('Hoster page is too large') }
      chunks.push(Buffer.from(chunk.value))
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { reader.releaseLock() }
}
function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function resolveBackgroundStream(url: string, options: HosterResolverOptions = {}): Promise<AutomaticHosterDownload | null> {
  downloadUrl(url)
  const timeoutMs = options.timeoutMs || 10_000
  if (options.signal?.aborted) return null
  const partition = options.partition || 'eclipse_background_' + crypto.randomUUID()
  const ses = session.fromPartition(partition)
  ses.setUserAgent(USER_AGENT)
  ses.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false))
  return new Promise(resolve => {
    let window: BrowserWindow | undefined, settled = false, inspecting = false
    const finish = (result: AutomaticHosterDownload | null) => {
      if (settled) return
      settled = true; clearTimeout(timer); clearInterval(poll); options.signal?.removeEventListener('abort', abort)
      ses.webRequest.onHeadersReceived(null as any); ses.removeListener('will-download', onDownload)
      if (window && !window.isDestroyed()) window.destroy()
      resolve(result)
    }
    const abort = () => finish(null)
    const timer = setTimeout(() => { if (!settled) options.onFailure?.('timeout'); finish(null) }, timeoutMs)
    const accept = async (target: string, type = '', disposition = '') => {
      try {
        downloadUrl(target)
        if (!isArchiveResponse(target, type, disposition)) return
        const headers = await cookiesFor(ses, target, url)
        finish({ streamUrl: target, headers, partition })
      } catch {}
    }
    const onDownload = (_event: Electron.Event, item: Electron.DownloadItem) => {
      item.cancel()
      void accept(item.getURL(), item.getMimeType?.() || '', `attachment; filename="${item.getFilename?.() || ''}"`)
    }
    const poll = setInterval(() => { void inspect() }, 800)
    const inspect = async () => {
      if (settled || inspecting || !window || window.isDestroyed()) return
      inspecting = true
      try {
        const blocked = await window.webContents.executeJavaScript(`(()=>{
          if(document.querySelector('.cf-turnstile,.g-recaptcha,.h-captcha'))return 'verification';
          const message=(document.querySelector('main,[role=main]')||document.body)?.innerText||'';
          if(message.length<4000&&/(?:file|folder|content).{0,60}(?:not found|no longer available|has been removed|does not exist)/i.test(message))return 'unavailable';
          const files=[...new Map([...document.querySelectorAll('a[href*="/download/web/"],a[download][href]')].filter(el=>/\\.(?:zip|rar|7z|iso|\\d{3})(?:$|[?#])/i.test(el.href)||/\\.(?:zip|rar|7z|iso|\\d{3})$/i.test(el.getAttribute('download')||'')).map(el=>[el.href,el])).values()];
          if(files.length>1)return 'multipart';
          window.__eclipseDownloadClicks ||= new WeakSet();
          const selectors=['a#download-link','a#direct_link','a#downloadbtn','a#download-btn','a#downloadButton','input[name=method_free]'];
          const candidates=files.concat(selectors.flatMap(selector=>[...document.querySelectorAll(selector)]),[...document.querySelectorAll('button')].filter(el=>/^(?:start download|free download|download file|download)\\b/i.test(el.textContent.trim())&&!/premium|upgrade|sign.?in|login/i.test(el.textContent)));
          for(const el of candidates)if(el.getBoundingClientRect().height>0&&!el.disabled&&!window.__eclipseDownloadClicks.has(el)){if(el.form?.querySelector('input[type=password]'))return 'verification';window.__eclipseDownloadClicks.add(el);el.click();break}
          return false;
        })()`)
        if (blocked === true || blocked === 'verification' || blocked === 'multipart' || blocked === 'unavailable') { options.onFailure?.(blocked === 'multipart' ? 'multipart' : blocked === 'unavailable' ? 'unavailable' : 'verification'); finish(null) }
      } catch {} finally { inspecting = false }
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    ses.on('will-download', onDownload)
    ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      const h = details.responseHeaders || {}, type = (h['content-type'] || h['Content-Type'] || [])[0] || '', disposition = (h['content-disposition'] || h['Content-Disposition'] || [])[0] || ''
      if (!settled && details.statusCode >= 200 && details.statusCode < 300 && isArchiveResponse(details.url, type, disposition)) { callback({ cancel: true }); void accept(details.url, type, disposition) }
      else callback({ cancel: false })
    })
    try {
      window = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, session: ses, backgroundThrottling: false } })
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      const navigate = (event: Electron.Event, target: string) => {
        try {
          const destination = downloadUrl(target)
          if (!destination.hostname.includes('.') && destination.hostname !== new URL(url).hostname) event.preventDefault()
        } catch { event.preventDefault() }
      }
      window.webContents.on('will-navigate', navigate)
      window.webContents.on('will-redirect', navigate)
      window.webContents.on('did-fail-load', (_event, code, _description, _target, mainFrame) => {
        if (mainFrame && code !== -3 && !settled) { options.onFailure?.('network'); finish(null) }
      })
      window.on('closed', abort); window.webContents.on('did-finish-load', () => { void inspect() })
      void window.loadURL(url).catch(abort)
    } catch { finish(null) }
  })
}

export async function resolveAutomaticHoster(rawUrl: string, options: HosterResolverOptions = {}): Promise<AutomaticHosterDownload | null> {
  let url = downloadUrl(rawUrl).href
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs || 25_000), ...(options.signal ? [options.signal] : [])])
  const partition = options.partition || 'eclipse_hoster_' + crypto.randomUUID()
  const ses = session.fromPartition(partition)
  ses.setUserAgent(USER_AGENT)
  let method = 'GET', fields: URLSearchParams | undefined, fileName: string | undefined, htmxPage: string | undefined
  const visited = new Set<string>()
  try {
    for (let step = 0; step < 5; step++) {
      signal.throwIfAborted()
      const key = method + url + (fields?.toString() || '') + (htmxPage || '')
      if (visited.has(key)) break
      visited.add(key)
      const response = await requestHosterPage(ses, url, { method, body: fields, signal,
        headers: { 'User-Agent': USER_AGENT, Referer: rawUrl, ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Dn-Dl': '1' } : {}), ...(htmxPage ? { 'HX-Request': 'true', 'HX-Current-URL': htmxPage } : {}) } })
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location'); void response.body?.cancel().catch(() => {})
        if (!location) return null
        const next = downloadUrl(new URL(location, url).href)
        // Never forward form tokens to a different origin on a 307/308 redirect.
        if (![307, 308].includes(response.status) || next.origin !== new URL(url).origin) { method = 'GET'; fields = undefined }
        htmxPage = undefined; url = next.href; continue
      }
      if (!response.ok) { void response.body?.cancel().catch(() => {}); options.onFailure?.(response.headers.get('cf-mitigated') === 'challenge' ? 'verification' : [404, 410].includes(response.status) ? 'unavailable' : response.status === 429 ? 'rate-limit' : [401,403].includes(response.status) ? 'forbidden' : 'network', response.status); return null }
      const htmxRedirect = htmxPage && response.headers.get('hx-redirect')
      if (htmxRedirect) {
        void response.body?.cancel().catch(() => {})
        url = downloadUrl(new URL(htmxRedirect, url).href).href
        method = 'GET'; fields = undefined; htmxPage = undefined; continue
      }
      if (isArchiveResponse(url, response.headers.get('content-type') || '', response.headers.get('content-disposition') || '')) {
        void response.body?.cancel().catch(() => {})
        return { streamUrl: url, headers: await cookiesFor(ses, url, rawUrl), fileName, partition }
      }
      const text = await pageText(response)
      if (text.trimStart().startsWith('{')) {
        const value = JSON.parse(text)
        if (typeof value.url === 'string') {
          let target = value.url
          if (!/^https?:/i.test(target)) { try { target = decodeURIComponent(target) } catch {} }
          return { streamUrl: downloadUrl(target).href, headers: await cookiesFor(ses, target, rawUrl), fileName, partition }
        }
        return null
      }
      const page = parseHosterPage(text, url)
      if (page.kind === 'blocked') { options.onFailure?.('verification'); return null }
      if (page.kind === 'direct') return { streamUrl: page.url, headers: await cookiesFor(ses, page.url, rawUrl), fileName, partition }
      if (page.kind === 'request') { htmxPage = url; url = page.url; method = 'GET'; fields = undefined; continue }
      if (page.kind === 'form') {
        if (page.wait) await wait(page.wait * 1000, signal)
        if (page.fileName) fileName = page.fileName
        url = page.url; fields = page.fields; method = 'POST'; htmxPage = undefined; continue
      }
      break
    }
  } catch { if (!options.signal?.aborted) options.onFailure?.(signal.aborted ? 'timeout' : 'network'); return null }
  return resolveBackgroundStream(url, { ...options, partition, timeoutMs: Math.min(12_000, options.timeoutMs || 12_000) })
}
