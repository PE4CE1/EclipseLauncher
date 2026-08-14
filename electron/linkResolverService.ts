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
 * Silent Background Headless Stream Sniffer
 * For Cloudflare-protected or complex hosters (DataNodes, MegaUp, 1Fichier without Debrid)
 */
export async function resolveHeadlessStream(url: string, timeoutMs = 12000): Promise<{ streamUrl: string; headers?: Record<string, string> } | null> {
  return new Promise((resolve) => {
    let resolved = false
    let hiddenWin: BrowserWindow | null = null

    const cleanup = () => {
      if (hiddenWin && !hiddenWin.isDestroyed()) {
        try {
          hiddenWin.destroy()
        } catch (e) {}
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

    try {
      hiddenWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      })

      // Capture 'will-download' session event
      hiddenWin.webContents.session.on('will-download', (event, item) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          const downloadUrl = item.getURL()
          item.cancel()
          cleanup()
          resolve({ streamUrl: downloadUrl })
        }
      })

      // Intercept binary header redirects
      hiddenWin.webContents.session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
        const headers = details.responseHeaders || {}
        const contentType = (headers['content-type'] || headers['Content-Type'] || [])[0] || ''
        const contentDisp = (headers['content-disposition'] || headers['Content-Disposition'] || [])[0] || ''
        
        const isBinaryStream = contentType.includes('application/octet-stream') || 
                               contentType.includes('application/zip') || 
                               contentType.includes('application/x-rar') || 
                               contentType.includes('application/x-7z') ||
                               contentDisp.includes('attachment')

        if (isBinaryStream && !resolved) {
          resolved = true
          clearTimeout(timer)
          const finalUrl = details.url
          cleanup()
          resolve({ streamUrl: finalUrl })
          callback({ cancel: true })
          return
        }

        callback({ cancel: false })
      })

      hiddenWin.loadURL(url)

      // Inject auto-click script for download buttons
      hiddenWin.webContents.on('did-finish-load', async () => {
        try {
          if (hiddenWin && !hiddenWin.isDestroyed()) {
            await hiddenWin.webContents.executeJavaScript(`
              (() => {
                const btn = document.querySelector('a#downloadButton, a[href*="download"], button[type="submit"], .btn-download, input[type="submit"]');
                if (btn) btn.click();
              })();
            `).catch(() => {})
          }
        } catch (e) {}
      })

    } catch (err) {
      console.error('[LinkResolver] Headless stream sniffer error:', err)
      cleanup()
      resolve(null)
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

  // 8. Headless sniffer for DataNodes / MegaUp / complex hosts
  if (trimmedUrl.includes('datanodes.to') || trimmedUrl.includes('megaup.net') || trimmedUrl.includes('1fichier.com')) {
    console.log(`[LinkResolver] Trying headless stream resolution for: ${trimmedUrl}`)
    const headless = await resolveHeadlessStream(trimmedUrl, 10000)
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

  // 9. Direct HTTP / Archive link fallback
  return {
    type: 'http',
    streamUrl: trimmedUrl,
    fileName: `${gameTitle}.zip`,
    isDirect: true,
    provider: 'Direct HTTP'
  }
}
