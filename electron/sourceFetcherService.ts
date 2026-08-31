import { app, BrowserWindow, session, net } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

export interface CachedSource {
  url: string
  name: string
  lastSynced: number
  data: any[]
}

const CACHE_DIR = path.join(app.getPath('userData'), 'sources_cache')

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    } catch (e) {
      console.error('[SourceFetcher] Failed to create cache directory:', e)
    }
  }
}

function getCacheFilePath(url: string): string {
  const hash = crypto.createHash('md5').update(url.trim()).digest('hex')
  return path.join(CACHE_DIR, `${hash}.json`)
}

export function getCachedSource(url: string): CachedSource | null {
  try {
    ensureCacheDir()
    const filePath = getCacheFilePath(url)
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.data)) {
        return parsed
      }
    }
  } catch (e) {
    console.warn(`[SourceFetcher] Could not read cache for ${url}:`, e)
  }
  return null
}

export function getAllCachedSources(): CachedSource[] {
  try {
    ensureCacheDir()
    const files = fs.readdirSync(CACHE_DIR)
    const results: CachedSource[] = []
    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          const raw = fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8')
          const parsed = JSON.parse(raw)
          if (parsed && parsed.url && Array.isArray(parsed.data)) {
            results.push(parsed)
          }
        } catch {}
      }
    }
    return results
  } catch (e) {
    console.error('[SourceFetcher] Failed to get all cached sources:', e)
    return []
  }
}

export function saveCachedSource(url: string, name: string, data: any[]): void {
  try {
    ensureCacheDir()
    const filePath = getCacheFilePath(url)
    const payload: CachedSource = {
      url: url.trim(),
      name: name || 'Source',
      lastSynced: Date.now(),
      data: Array.isArray(data) ? data : []
    }
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8')
    console.log(`[SourceFetcher] Cached ${payload.data.length} items for ${url} -> ${filePath}`)
  } catch (e) {
    console.error(`[SourceFetcher] Failed to write cache for ${url}:`, e)
  }
}

export function removeCachedSource(url: string): void {
  try {
    const filePath = getCacheFilePath(url)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {}
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

let activeSolverWin: BrowserWindow | null = null

/**
 * Robustly fetches and caches a Hydra JSON source.
 * Handles Cloudflare Turnstile challenges, persistent cookie sessions, and disk caching.
 */
export async function fetchAndCacheSource(rawUrl: string): Promise<{ success: boolean; name?: string; data?: any[]; error?: string }> {
  const url = rawUrl.trim()
  if (!url) return { success: false, error: 'Empty URL' }

  const ses = session.fromPartition('persist:hydra_sources')
  ses.setUserAgent(CHROME_UA)

  // 1. First attempt: Direct Chromium net.fetch with persistent session
  try {
    console.log(`[SourceFetcher] Attempting direct fetch for: ${url}`)
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': CHROME_UA,
        'Accept': 'application/json, text/plain, */*',
        'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8'
      }
    })

    if (response.ok) {
      const text = await response.text()
      if (text && (text.startsWith('{') || text.includes('"downloads"'))) {
        try {
          const json = JSON.parse(text)
          const downloads = Array.isArray(json.downloads) ? json.downloads : []
          const name = json.name || new URL(url).pathname.split('/').pop()?.replace('.json', '') || 'Source'
          saveCachedSource(url, name, downloads)
          return { success: true, name, data: downloads }
        } catch (e) {
          console.warn('[SourceFetcher] Failed to parse JSON from direct fetch')
        }
      }
    } else {
      console.log(`[SourceFetcher] Direct fetch HTTP status: ${response.status}`)
    }
  } catch (err) {
    console.log(`[SourceFetcher] Direct fetch error:`, err)
  }

  // 2. Second attempt: Interactive / Semi-Automatic Cloudflare Turnstile Solver
  const cached = getCachedSource(url)

  try {
    console.log(`[SourceFetcher] Spawning Cloudflare solver window for ${url}...`)
    const solverResult = await new Promise<{ success: boolean; name?: string; data?: any[]; error?: string }>((resolve) => {
      let resolved = false

      if (activeSolverWin && !activeSolverWin.isDestroyed()) {
        try { activeSolverWin.destroy() } catch {}
      }

      const solverWin = new BrowserWindow({
        width: 480,
        height: 520,
        show: false,
        paintWhenInitiallyHidden: true,
        enableLargerThanScreen: true,
        center: true,
        title: 'Eclipse — Quelle wird verifiziert...',
        alwaysOnTop: true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:hydra_sources',
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          disableBlinkFeatures: 'AutomationControlled',
          
          backgroundThrottling: false
        }
      })

      activeSolverWin = solverWin

      const cleanup = () => {
        if (!solverWin.isDestroyed()) {
          try { solverWin.destroy() } catch {}
        }
        if (activeSolverWin === solverWin) activeSolverWin = null
      }

      // Max 45 seconds before timeout
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          if (cached) {
            console.log(`[SourceFetcher] Verification timeout. Returning disk cached data for ${url}`)
            resolve({ success: true, name: cached.name, data: cached.data })
          } else {
            resolve({ success: false, error: 'Verification timed out' })
          }
        }
      }, 15000)

      solverWin.on('closed', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          if (cached) {
            console.log(`[SourceFetcher] Solver closed by user. Returning disk cached data for ${url}`)
            resolve({ success: true, name: cached.name, data: cached.data })
          } else {
            resolve({ success: false, error: 'Verification window closed' })
          }
        }
      })

      let pollInterval: NodeJS.Timeout | null = null

      const checkCompletion = async () => {
        if (resolved || solverWin.isDestroyed()) {
          if (pollInterval) clearInterval(pollInterval)
          return
        }

        try {
          
          const content = await solverWin.webContents.executeJavaScript(`
            (function() {
              const pre = document.querySelector('pre');
              if (pre && pre.textContent) return pre.textContent;
              if (document.body && document.body.innerText && (document.body.innerText.startsWith('{') || document.body.innerText.includes('"downloads"'))) {
                return document.body.innerText;
              }
              return '';
            })()
          `).catch(() => '')

          if (content && (content.startsWith('{') || content.includes('"downloads"')) && content.length > 50) {
            resolved = true
            if (pollInterval) clearInterval(pollInterval)
            clearTimeout(timer)
            cleanup()

            try {
              const json = JSON.parse(content)
              const downloads = Array.isArray(json.downloads) ? json.downloads : []
              const name = json.name || new URL(url).pathname.split('/').pop()?.replace('.json', '') || 'Source'
              saveCachedSource(url, name, downloads)
              resolve({ success: true, name, data: downloads })
            } catch (err: any) {
              resolve({ success: false, error: err?.message || 'Failed to parse JSON' })
            }
          }
        } catch {}
      }

      solverWin.webContents.on('did-finish-load', () => {
        if (!pollInterval) {
          pollInterval = setInterval(checkCompletion, 800)
        }
      })

      solverWin.loadURL(url).catch((err) => {
        console.warn('[SourceFetcher] Solver window loadURL error:', err)
      })
    })

    if (solverResult.success) {
      return solverResult
    }
  } catch (err) {
    console.error('[SourceFetcher] Cloudflare solver error:', err)
  }

  // 3. Fallback to existing disk cache
  if (cached) {
    console.log(`[SourceFetcher] Using fallback disk cache for ${url} (${cached.data.length} games)`)
    return { success: true, name: cached.name, data: cached.data }
  }

  return { success: false, error: 'Could not fetch or verify source' }
}
