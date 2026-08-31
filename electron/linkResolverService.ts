import { URL } from 'url'
import path from 'path'
import fs from 'fs'
import { app, BrowserWindow, session } from 'electron'

export type ResolvedDownload = {
  type: 'torrent' | 'http'
  streamUrl: string
  fileName: string
  isDirect: boolean
  provider?: string
  headers?: Record<string, string>
}

// Read settings to check for Debrid API keys
function getDebridKey(): { realDebrid?: string; torbox?: string; allDebrid?: string } {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return {
        realDebrid: s.realDebridKey?.trim(),
        torbox: s.torboxKey?.trim(),
        allDebrid: s.allDebridKey?.trim()
      }
    }
  } catch (e) {}
  return {}
}

/**
 * Resolves Real-Debrid unrestricted link for premium hosters (1fichier, Rapidgator, Mega, etc.)
 */
async function resolveRealDebrid(url: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ link: url }).toString()
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.download) {
        console.log(`[LinkResolver] Real-Debrid successfully un-restricted link: ${data.download}`)
        return data.download
      }
    }
  } catch (e) {
    console.error('[LinkResolver] Real-Debrid resolve error:', e)
  }
  return null
}

/**
 * Resolves TorBox unrestricted link
 */
async function resolveTorbox(url: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.torbox.app/v1/api/webdl/createwebdownload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ link: url })
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.data && data.data.download_url) {
        return data.data.download_url
      }
    }
  } catch (e) {
    console.error('[LinkResolver] TorBox resolve error:', e)
  }
  return null
}

/**
 * Resolves Gofile file ID to direct tokenized CDN download URL with proper auth headers/cookies
 */
async function resolveGofile(url: string): Promise<{ streamUrl: string; headers: Record<string, string> } | null> {
  try {
    const match = url.match(/gofile\.io\/d\/([a-zA-Z0-9_-]+)/i)
    if (!match) return null
    const contentId = match[1]

    // Create guest account token
    const accRes = await fetch('https://api.gofile.io/accounts', { method: 'POST' })
    const accData = await accRes.json()
    const token = accData?.data?.token || ''

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`https://api.gofile.io/contents/${contentId}?wt=4fd6sg89d7s6`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.status === 'ok' && data?.data?.children) {
      const children = Object.values(data.data.children) as any[]
      if (children.length > 0 && children[0].link) {
        const streamUrl = children[0].link
        const streamHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Cookie': `accountToken=${token}`,
          'Authorization': `Bearer ${token}`
        }
        return { streamUrl, headers: streamHeaders }
      }
    }
  } catch (e) {
    console.error('[LinkResolver] Gofile resolve error:', e)
  }
  return null
}

/**
 * Resolves PixelDrain URL to direct download stream
 */
function resolvePixelDrain(url: string): string | null {
  const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i)
  if (match) {
    return `https://pixeldrain.com/api/file/${match[1]}`
  }
  return null
}

/**
 * Resolves Buzzheavier direct download link
 */
function resolveBuzzheavier(url: string): { streamUrl: string; headers: Record<string, string> } | null {
  const match = url.match(/buzzheavier\.com\/(?:f\/)?([a-zA-Z0-9_-]+)/i)
  if (match) {
    const fileId = match[1]
    return {
      streamUrl: `https://buzzheavier.com/${fileId}/download`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': url
      }
    }
  }
  return null
}

/**
 * Resolves MediaFire direct download link
 */
async function resolveMediafire(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    const text = await res.text()
    const match = text.match(/href="((?:https?:)?\/\/[^"]*mediafire\.com\/[^"]*download[^"]*)"/i) || text.match(/aria-label="Download file"\s+href="([^"]+)"/i) || text.match(/id="downloadButton"\s+href="([^"]+)"/i)
    if (match) {
      return match[1]
    }
  } catch (e) {
    console.error('[LinkResolver] Mediafire resolve error:', e)
  }
  return null
}

/**
 * Resolves ViKiNG FiLE (vik1ngfile.site / vikingfile.com) direct high-speed stream
 */
async function resolveVikingFile(url: string, timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    let hiddenWin: BrowserWindow | null = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    const cleanup = () => {
      if (hiddenWin && !hiddenWin.isDestroyed()) {
        try { hiddenWin.destroy() } catch {}
        hiddenWin = null
      }
    }

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(null)
      }
    }, timeoutMs)

    let pollInterval: NodeJS.Timeout | null = null

    hiddenWin.webContents.on('did-finish-load', () => {
      pollInterval = setInterval(async () => {
        if (resolved || !hiddenWin || hiddenWin.isDestroyed()) {
          if (pollInterval) clearInterval(pollInterval)
          return
        }
        try {
          const href = await hiddenWin.webContents.executeJavaScript(`
            (() => {
              const el = document.getElementById('download-link');
              return el ? el.href : '';
            })()
          `).catch(() => '')
          if (href && href.startsWith('http') && !href.includes('#')) {
            resolved = true
            if (pollInterval) clearInterval(pollInterval)
            clearTimeout(timer)
            cleanup()
            resolve(href)
          }
        } catch {}
      }, 500)
    })

    hiddenWin.loadURL(url).catch(() => {
      if (!resolved) {
        resolved = true
        if (pollInterval) clearInterval(pollInterval)
        clearTimeout(timer)
        cleanup()
        resolve(null)
      }
    })
  })
}

/**
 * Resolves Qiwi direct download link
 */
async function resolveQiwi(url: string): Promise<string | null> {
  try {
    const match = url.match(/qiwi\.gg\/file\/([a-zA-Z0-9_-]+)/i)
    if (match) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      })
      const text = await res.text()
      const dlMatch = text.match(/href="([^"]+extract[^"]+)"/i) || text.match(/href="([^"]+\/download\/[^"]+)"/i)
      if (dlMatch) return dlMatch[1]
    }
  } catch (e) {
    console.error('[LinkResolver] Qiwi resolve error:', e)
  }
  return null
}

/**
 * Eclipse Browser Download Resolver
 * 
 * Opens a VISIBLE, real Chromium window to resolve downloads from Cloudflare-protected
 * XFS hosters (DataNodes, AkiraBox, FileKeeper). A visible window behaves exactly like
 * a real browser, so Cloudflare's bot detection is reliably bypassed.
 * 
 * The window auto-clicks XFS form buttons, then intercepts the final download URL via:
 *  1. session 'will-download' event (when browser triggers a file download)
 *  2. webRequest.onHeadersReceived (when CDN responds with binary content-type)
 * 
 * Session cookies are forwarded to the Node.js downloader so CDN tokens remain valid.
 */
export async function resolveWithVisibleBrowser(
  url: string,
  gameTitle: string,
  timeoutMs = 120000
): Promise<{ streamUrl: string; headers?: Record<string, string> } | null> {
  return new Promise((resolve) => {
    let isResolved = false
    let browserWin: BrowserWindow | null = null
    const PARTITION = 'persist:eclipse_dl_resolver'
    const ses = session.fromPartition(PARTITION)

    ses.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    )

    const finish = (result: { streamUrl: string; headers?: Record<string, string> } | null) => {
      if (isResolved) return
      isResolved = true
      clearTimeout(timer)
      // Clean up session-level interceptor
      try { ses.webRequest.onHeadersReceived(null as any) } catch {}
      // Destroy window
      if (browserWin && !browserWin.isDestroyed()) {
        try { browserWin.destroy() } catch {}
        browserWin = null
      }
      resolve(result)
    }

    const timer = setTimeout(() => {
      console.warn(`[BrowserResolver] Timed out (${timeoutMs}ms) for: ${url}`)
      finish(null)
    }, timeoutMs)

    // ── Intercept binary CDN streams at session level ───────────────────────
    ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      if (isResolved) { callback({ cancel: false }); return }

      const rh = details.responseHeaders || {}
      const ct  = (rh['content-type']  || rh['Content-Type']  || [])[0] || ''
      const cd  = (rh['content-disposition'] || rh['Content-Disposition'] || [])[0] || ''

      const isBinary =
        ct.includes('application/octet-stream') ||
        ct.includes('application/zip') ||
        ct.includes('application/x-rar') ||
        ct.includes('application/x-7z') ||
        ct.includes('application/x-zip') ||
        cd.toLowerCase().includes('attachment')

      // Only accept fully-qualified http(s) URLs to avoid https://undefined/...
      if (isBinary && details.url.startsWith('http')) {
        console.log(`[BrowserResolver] Binary stream intercepted: ${details.url}`)
        // Grab session cookies so Node downloader can authenticate with CDN
        ses.cookies.get({ url: details.url }).then(cookies => {
          const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ')
          finish({
            streamUrl: details.url,
            headers: {
              ...(cookie ? { Cookie: cookie } : {}),
              Referer: url,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            }
          })
        }).catch(() => finish({ streamUrl: details.url, headers: { Referer: url } }))
        callback({ cancel: true })
        return
      }
      callback({ cancel: false })
    })

    // ── Intercept will-download (Electron's native download trigger) ─────────
    ses.once('will-download', (event, item) => {
      const dlUrl = item.getURL()
      if (dlUrl && dlUrl.startsWith('http') && !isResolved) {
        console.log(`[BrowserResolver] will-download caught: ${dlUrl}`)
        item.cancel() // We handle it ourselves
        ses.cookies.get({ url: dlUrl }).then(cookies => {
          const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ')
          finish({
            streamUrl: dlUrl,
            headers: {
              ...(cookie ? { Cookie: cookie } : {}),
              Referer: url,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            }
          })
        }).catch(() => finish({ streamUrl: dlUrl, headers: { Referer: url } }))
      }
    })

    try {
      // Path to the compiled stealth preload (built by vite-plugin-electron)
      const preloadPath = path.join(app.getAppPath(), 'dist-electron', 'resolverPreload.js')

      const CLEAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      ses.setUserAgent(CLEAN_UA)

      browserWin = new BrowserWindow({
        width: 480,
        height: 580,
        show: true,  // MUST be visible – hidden windows fail Cloudflare bot checks
        title: `Eclipse ↓  Bereite Download vor...`,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        center: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: false,   // false needed so preload can patch navigator.*
          sandbox: false,            // false = better Chromium fingerprint for CF
          session: ses,
          disableBlinkFeatures: 'AutomationControlled',  // Remove navigator.webdriver
          preload: fs.existsSync(preloadPath) ? preloadPath : undefined
        }
      })

      // Also set UA on the webContents level so navigator.userAgent JS property matches
      browserWin.webContents.setUserAgent(CLEAN_UA)

      // Block ad popups from opening new windows
      browserWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      // User manually closed the window → abort
      browserWin.on('closed', () => {
        if (!isResolved) {
          console.log('[BrowserResolver] Resolver window closed by user')
          finish(null)
        }
      })

      // Inject status bar + XFS auto-clicker on every page load/navigation
      const injectHelper = async () => {
        if (!browserWin || browserWin.isDestroyed() || isResolved) return

        // Status bar so the user knows Eclipse is working
        await browserWin.webContents.insertCSS(`
          #__ecl_bar {
            position: fixed !important; bottom: 0 !important; left: 0 !important;
            right: 0 !important; background: #0d1117 !important; color: #58a6ff !important;
            font-size: 11px !important; font-family: monospace !important;
            padding: 5px 14px !important; z-index: 2147483647 !important;
            border-top: 1px solid #30363d !important; pointer-events: none !important;
            display: flex !important; align-items: center !important; gap: 6px !important;
          }
        `).catch(() => {})

        await browserWin.webContents.executeJavaScript(`
          (() => {
            if (!document.getElementById('__ecl_bar')) {
              const b = document.createElement('div');
              b.id = '__ecl_bar';
              b.innerHTML = '⬇&nbsp; <b>Eclipse Launcher</b> – Warte auf Download-Link...';
              document.body && document.body.appendChild(b);
            }
            if (window.__eclAC) return;
            window.__eclAC = true;

            const tryClick = () => {
              // ── Stage 1: XFS "Free Download" form (hidden fields + submit) ─
              const form = document.querySelector('form[name="F1"]');
              if (form) {
                const btn = form.querySelector(
                  'input[name="method_free"], ' +
                  'input[type="submit"]:not([disabled]), ' +
                  'button[type="submit"]:not([disabled])'
                );
                if (btn) { btn.click(); return; }
              }

              // ── Stage 2: Direct download link visible after countdown ───────
              const SELS = [
                'a#downloadbtn', 'a#download-btn', 'a.download-btn',
                'a#direct_link', 'a.get', 'a.btn-success',
                'a.btn-primary:not([href="#"])',
                'a[href*="/dl/"]:not([href="#"])',
                'a[href*="/download/"]:not([href="#"])',
                'input[name="method_free"]',
              ];
              for (const sel of SELS) {
                const el = document.querySelector(sel);
                const href = (el && el.tagName === 'A') ? el.getAttribute('href') : null;
                if (el && el.offsetHeight > 0 && !el.disabled &&
                    (!href || (!href.startsWith('#') && !href.startsWith('javascript:')))) {
                  el.click();
                  return;
                }
              }
            };

            tryClick();
            setInterval(tryClick, 1500);
          })();
        `).catch(() => {})
      }

      browserWin.webContents.on('did-finish-load', injectHelper)
      browserWin.webContents.on('did-navigate', injectHelper)

      browserWin.loadURL(url).catch(err => {
        console.warn('[BrowserResolver] loadURL error:', err)
      })

    } catch (err) {
      console.error('[BrowserResolver] Fatal error:', err)
      finish(null)
    }
  })
}

/**
 * Silent Background Headless Stream Sniffer
 * For non-CF-protected complex hosters (MegaUp, 1Fichier without Debrid, etc.)
 */
export async function resolveHeadlessStream(url: string, timeoutMs = 12000): Promise<{ streamUrl: string; headers?: Record<string, string> } | null> {
  return new Promise((resolve) => {
    let resolved = false
    let hiddenWin: BrowserWindow | null = null

    const cleanup = () => {
      if (hiddenWin && !hiddenWin.isDestroyed()) {
        try { hiddenWin.destroy() } catch {}
        hiddenWin = null
      }
    }

    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; cleanup(); resolve(null) }
    }, timeoutMs)

    try {
      hiddenWin = new BrowserWindow({
        show: false, width: 800, height: 600,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
      })

      hiddenWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      hiddenWin.webContents.session.once('will-download', (event, item) => {
        if (!resolved) {
          resolved = true; clearTimeout(timer)
          const dlUrl = item.getURL(); item.cancel(); cleanup()
          resolve({ streamUrl: dlUrl })
        }
      })

      hiddenWin.webContents.session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
        const rh = details.responseHeaders || {}
        const ct = (rh['content-type'] || rh['Content-Type'] || [])[0] || ''
        const cd = (rh['content-disposition'] || rh['Content-Disposition'] || [])[0] || ''
        const isBinary = ct.includes('application/octet-stream') || ct.includes('application/zip') ||
                         ct.includes('application/x-rar') || ct.includes('application/x-7z') ||
                         cd.toLowerCase().includes('attachment')

        if (isBinary && details.url.startsWith('http') && !resolved) {
          resolved = true; clearTimeout(timer); const finalUrl = details.url
          cleanup(); resolve({ streamUrl: finalUrl }); callback({ cancel: true }); return
        }
        callback({ cancel: false })
      })

      hiddenWin.loadURL(url)

      hiddenWin.webContents.on('did-finish-load', async () => {
        try {
          if (hiddenWin && !hiddenWin.isDestroyed()) {
            await hiddenWin.webContents.executeJavaScript(`
              (() => {
                if (window.__eclH) return; window.__eclH = true;
                setInterval(() => {
                  const form = document.querySelector('form[name="F1"]');
                  if (form) { const b = form.querySelector('input[type="submit"]:not([disabled]), button[type="submit"]:not([disabled])'); if (b) b.click(); return; }
                  const b = document.querySelector('a#direct_link, a#downloadbtn, a.download-btn, input[name="method_free"]');
                  if (b && b.offsetHeight > 0 && !b.disabled) b.click();
                }, 1200);
              })();
            `).catch(() => {})
          }
        } catch {}
      })
    } catch (err) {
      console.error('[HeadlessSniffer] Error:', err); cleanup(); resolve(null)
    }
  })
}

/**
 * Main link resolution engine
 */
export async function resolveDownloadLink(rawUrl: string, gameTitle: string): Promise<ResolvedDownload> {
  const trimmedUrl = rawUrl.trim()

  // 1. BitTorrent Magnet Link
  if (trimmedUrl.startsWith('magnet:')) {
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://opentracker.i2p.rocks:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.tiny-vps.com:6969/announce'
    ]
    
    let enhancedMagnet = trimmedUrl
    trackers.forEach(tr => {
      if (!enhancedMagnet.includes(encodeURIComponent(tr)) && !enhancedMagnet.includes(tr)) {
        enhancedMagnet += `&tr=${encodeURIComponent(tr)}`
      }
    })

    return {
      type: 'torrent',
      streamUrl: enhancedMagnet,
      fileName: `${gameTitle}.torrent`,
      isDirect: true,
      provider: 'BitTorrent (P2P)'
    }
  }

  // 2. Direct .torrent file URL
  if (trimmedUrl.endsWith('.torrent') || trimmedUrl.includes('/torrent/')) {
    return {
      type: 'torrent',
      streamUrl: trimmedUrl,
      fileName: `${gameTitle}.torrent`,
      isDirect: true,
      provider: 'BitTorrent File'
    }
  }

  // Check Debrid API Key first if available
  const debrid = getDebridKey()
  if (debrid.realDebrid) {
    const rdUrl = await resolveRealDebrid(trimmedUrl, debrid.realDebrid)
    if (rdUrl) {
      return {
        type: 'http',
        streamUrl: rdUrl,
        fileName: `${gameTitle}.zip`,
        isDirect: true,
        provider: 'Real-Debrid (Highspeed)'
      }
    }
  }
  if (debrid.torbox) {
    const tbUrl = await resolveTorbox(trimmedUrl, debrid.torbox)
    if (tbUrl) {
      return {
        type: 'http',
        streamUrl: tbUrl,
        fileName: `${gameTitle}.zip`,
        isDirect: true,
        provider: 'TorBox (Highspeed)'
      }
    }
  }

  // 3. PixelDrain Direct API Stream
  const pd = resolvePixelDrain(trimmedUrl)
  if (pd) {
    return {
      type: 'http',
      streamUrl: pd,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'PixelDrain Direct'
    }
  }

  // 4. ViKiNG FiLE Direct Stream Resolver
  if (trimmedUrl.includes('vik1ngfile') || trimmedUrl.includes('vikingfile')) {
    console.log(`[LinkResolver] Resolving VikingFile link: ${trimmedUrl}`)
    const vikingStream = await resolveVikingFile(trimmedUrl, 8000)
    if (vikingStream) {
      return {
        type: 'http',
        streamUrl: vikingStream,
        fileName: `${gameTitle}.zip`,
        isDirect: true,
        provider: 'ViKiNG FiLE Direct'
      }
    }
  }

  // 5. Gofile API Resolver
  const gofile = await resolveGofile(trimmedUrl)
  if (gofile) {
    return {
      type: 'http',
      streamUrl: gofile.streamUrl,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'Gofile CDN',
      headers: gofile.headers
    }
  }

  // 6. Buzzheavier Resolver
  const buzz = resolveBuzzheavier(trimmedUrl)
  if (buzz) {
    return {
      type: 'http',
      streamUrl: buzz.streamUrl,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'Buzzheavier Direct',
      headers: buzz.headers
    }
  }

  // 7. Mediafire Resolver
  const mediafire = await resolveMediafire(trimmedUrl)
  if (mediafire) {
    return {
      type: 'http',
      streamUrl: mediafire,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'MediaFire Direct'
    }
  }

  // 8. Qiwi Direct Resolver
  const qiwi = await resolveQiwi(trimmedUrl)
  if (qiwi) {
    return {
      type: 'http',
      streamUrl: qiwi,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'Qiwi Direct'
    }
  }

  // 8. XFS Resolver: Opens a VISIBLE browser window for Cloudflare-protected hosters.
  //    DataNodes, AkiraBox and FileKeeper all use Cloudflare which blocks session.fetch()
  //    and hidden headless windows. A visible Chromium window passes CF reliably.
  const xfsHosts = ['datanodes', 'filekeeper', 'akirabox']
  if (xfsHosts.some(h => trimmedUrl.includes(h))) {
    console.log(`[LinkResolver] Opening visible browser resolver for: ${trimmedUrl}`)
    const result = await resolveWithVisibleBrowser(trimmedUrl, gameTitle, 120000)
    if (result && result.streamUrl && result.streamUrl.startsWith('http')) {
      console.log(`[BrowserResolver] Successfully resolved: ${result.streamUrl}`)
      return {
        type: 'http',
        streamUrl: result.streamUrl,
        fileName: `${gameTitle}.zip`,
        isDirect: true,
        provider: 'Eclipse Browser Resolver',
        headers: result.headers
      }
    }
    // Last resort: open in system browser so user can download manually
    const { shell } = require('electron')
    shell.openExternal(trimmedUrl).catch(() => {})
    throw new Error('Download wurde im Browser geöffnet. Bitte lade die Datei manuell herunter und importiere sie.')
  }

  // 9. Headless sniffer for non-CF complex hosts (MegaUp, 1Fichier, etc.)
  const headlessHosts = ['megaup.net', '1fichier.com']
  if (headlessHosts.some(h => trimmedUrl.includes(h))) {
    console.log(`[LinkResolver] Trying headless sniffer for: ${trimmedUrl}`)
    const headless = await resolveHeadlessStream(trimmedUrl, 30000)
    if (headless && headless.streamUrl) {
      return {
        type: 'http',
        streamUrl: headless.streamUrl,
        fileName: `${gameTitle}.zip`,
        isDirect: true,
        provider: 'Direct Stream Sniffer',
        headers: headless.headers
      }
    }
  }

  // 10. Direct HTTP / Archive link fallback
  return {
    type: 'http',
    streamUrl: trimmedUrl,
    fileName: `${gameTitle}.zip`,
    isDirect: true,
    provider: 'Direct HTTP'
  }
}
