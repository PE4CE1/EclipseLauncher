import { URL } from 'url'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export type ResolvedDownload = {
  type: 'torrent' | 'http'
  streamUrl: string
  fileName: string
  isDirect: boolean
  provider?: string
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
 * Resolves Gofile file ID to direct tokenized CDN download URL
 */
async function resolveGofile(url: string): Promise<string | null> {
  try {
    // Example: https://gofile.io/d/AbCdEf -> id: AbCdEf
    const match = url.match(/gofile\.io\/d\/([a-zA-Z0-9_-]+)/i)
    if (!match) return null
    const contentId = match[1]

    // Create guest account token
    const accRes = await fetch('https://api.gofile.io/accounts', { method: 'POST' })
    const accData = await accRes.json()
    const token = accData?.data?.token

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
        return children[0].link
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
  // Example: https://pixeldrain.com/u/abc12345 -> https://pixeldrain.com/api/file/abc12345
  const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i)
  if (match) {
    return `https://pixeldrain.com/api/file/${match[1]}`
  }
  return null
}

/**
 * Resolves Qiwi direct download link
 */
async function resolveQiwi(url: string): Promise<string | null> {
  try {
    // Example: https://qiwi.gg/file/abc12345 -> Direct extraction or head request
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
 * Main link resolution engine
 */
export async function resolveDownloadLink(rawUrl: string, gameTitle: string): Promise<ResolvedDownload> {
  const trimmedUrl = rawUrl.trim()

  // 1. BitTorrent Magnet Link
  if (trimmedUrl.startsWith('magnet:')) {
    // Inject best public DHT trackers if missing for ultra-fast peer discovery
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

  // 4. Gofile API Resolver
  const gofile = await resolveGofile(trimmedUrl)
  if (gofile) {
    return {
      type: 'http',
      streamUrl: gofile,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'Gofile CDN'
    }
  }

  // 5. Qiwi Direct Resolver
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

  // 6. Direct HTTP / Archive link (.zip, .rar, .7z, .iso, .exe, or direct CDN)
  return {
    type: 'http',
    streamUrl: trimmedUrl,
    fileName: `${gameTitle}.zip`,
    isDirect: true,
    provider: 'Direct HTTP'
  }
}
