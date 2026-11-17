import { URL } from 'url'
import path from 'path'
import fs from 'fs'
import { resolveAutomaticHoster, resolveBackgroundStream, type HosterResolverOptions } from './automaticHosterResolver'
import { DownloadResolverError } from './downloadErrors'
import type { DownloadIssueCode } from '../src/types/downloads'
import { createConcurrentQueue } from '../src/services/concurrentQueue'
const gofileQueue = createConcurrentQueue(1)
import { app } from 'electron'
import { downloadUrl } from './downloadPaths'

function resolverFetch(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: init.signal || AbortSignal.timeout(15000) })
}

function hostIs(url: string, host: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase()
  return hostname === host || hostname.endsWith(`.${host}`)
}

export type ResolvedDownload = {
  type: 'torrent' | 'http'
  streamUrl: string
  fileName: string
  isDirect: boolean
  provider?: string
  headers?: Record<string, string>
  partition?: string
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
    const res = await resolverFetch('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
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
    const res = await resolverFetch('https://api.torbox.app/v1/api/webdl/createwebdownload', {
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
async function resolveGofile(url: string, options: HosterResolverOptions) {
  // The regular public page manages guest access. Do not keep expired website
  // tokens or create a new anonymous API account for every attempted download.
  let failure: DownloadIssueCode = 'no-file'
  const result = await gofileQueue.run(async () => {
    options.signal?.throwIfAborted()
    return resolveBackgroundStream(url, { ...options, partition: 'eclipse_gofile_downloads', timeoutMs: options.timeoutMs || 15_000, onFailure: code => { failure = code } })
  })
  if (!result) throw new DownloadResolverError(failure, 'Gofile did not provide an automatic file link')
  return result
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
 * Main link resolution engine
 */
export async function resolveDownloadLink(rawUrl: string, gameTitle: string, options: HosterResolverOptions = {}): Promise<ResolvedDownload> {
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

  downloadUrl(trimmedUrl)

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
  const pd = hostIs(trimmedUrl, 'pixeldrain.com') ? resolvePixelDrain(trimmedUrl) : null
  if (pd) {
    return {
      type: 'http',
      streamUrl: pd,
      fileName: `${gameTitle}.zip`,
      isDirect: true,
      provider: 'PixelDrain Direct'
    }
  }

  // Gofile public-page resolver
  const gofile = hostIs(trimmedUrl, 'gofile.io') ? await resolveGofile(trimmedUrl, options) : null
  if (gofile) {
    return {
      type: 'http',
      streamUrl: gofile.streamUrl,
      fileName: gofile.fileName || `${gameTitle}.zip`,
      isDirect: true,
      provider: 'Gofile CDN',
      headers: gofile.headers,
      partition: gofile.partition
    }
  }

  // Public pages use the same bounded, session-aware resolution path.
  const automaticHosts = ['buzzheavier.com', 'mediafire.com', 'qiwi.gg', 'datanodes.to', 'filekeeper.net', 'akirabox.com', 'akirabox.to', 'vikingfile.com', 'vik1ngfile.site', 'megaup.net', '1fichier.com']
  if (automaticHosts.some(host => hostIs(trimmedUrl, host))) {
    let failure: DownloadIssueCode = 'no-file', status: number | undefined
    const result = await resolveAutomaticHoster(trimmedUrl, { ...options, onFailure: (code, httpStatus) => { failure = code; status = httpStatus } })
    if (!result) throw new DownloadResolverError(failure, 'The host did not provide an automatic file download', status)
    return { type: 'http', streamUrl: result.streamUrl, fileName: result.fileName || gameTitle + '.zip', isDirect: true, provider: 'Automatic hoster', headers: result.headers, partition: result.partition }
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
